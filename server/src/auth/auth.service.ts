import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    let user: any;
    const ntMatch = username.match(/^NT(\d+)$/i);
    if (ntMatch) {
      // Login by Employee ID (NT10001)
      const userId = Number(ntMatch[1]) - 10000;
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { roleRelation: true, userRoles: { include: { role: true } } },
      });
    } else {
      // Login by login_name (e.g. prasadp)
      user = await this.prisma.user.findFirst({
        where: { loginName: username },
        include: { roleRelation: true, userRoles: { include: { role: true } } },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated. Contact your administrator.');
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      role_id: user.roleId,
      role_name: user.roleRelation?.name,
    };

    // expiresIn is typed as ms `StringValue` — env var is `string`, cast required
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    } as object);

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    } as object);

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const decoded = this.jwtService.decode(refreshToken) as any;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        role_id: user.roleId,
        role_name: user.roleRelation?.name,
        currency: user.currency,
        roles: (user.userRoles || []).map((ur: any) => ({
          role_id: ur.roleId,
          role_name: ur.role?.name,
          is_default: ur.isDefault,
        })),
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided.');
    }

    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const stored = await this.prisma.refreshToken.findFirst({
        where: { tokenHash, userId: decoded.id },
      });

      if (!stored) {
        throw new UnauthorizedException('Refresh token not found or revoked.');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.id },
        include: { roleRelation: true, userRoles: { include: { role: true } } },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or deactivated.');
      }

      const payload = { id: user.id, username: user.username, role: user.role, role_id: user.roleId, role_name: user.roleRelation?.name };

      const newAccessToken = this.jwtService.sign(payload, {
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      } as object);

      const newRefreshToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      } as object);

      const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      const newDecoded = this.jwtService.decode(newRefreshToken) as any;

      // Atomic token rotation: delete old, create new in one transaction
      await this.prisma.$transaction([
        this.prisma.refreshToken.delete({ where: { id: stored.id } }),
        this.prisma.refreshToken.create({
          data: {
            userId: user.id,
            tokenHash: newHash,
            expiresAt: new Date(newDecoded.exp * 1000),
          },
        }),
      ]);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          role_id: user.roleId,
          role_name: user.roleRelation?.name,
          currency: user.currency,
          roles: (user.userRoles || []).map((ur: any) => ({
            role_id: ur.roleId,
            role_name: ur.role?.name,
            is_default: ur.isDefault,
          })),
        },
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new HttpException('Current password is incorrect.', HttpStatus.BAD_REQUEST);
    }

    const hash = await bcrypt.hash(newPassword, 10);

    // Atomic: update password + revoke all refresh tokens together
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    return { message: 'Password changed successfully.' };
  }
}
