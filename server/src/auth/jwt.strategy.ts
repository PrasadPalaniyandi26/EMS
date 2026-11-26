import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: any) {
    if (!payload?.id) {
      throw new UnauthorizedException('Invalid token payload');
    }
    // The token says who is calling; what they may do is read now, so deactivating or demoting takes effect at once
    const user = await this.prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, username: true, isActive: true, roleId: true, roleRelation: { select: { name: true } } } });
    if (!user?.isActive) throw new UnauthorizedException('This account is not active.');
    return { id: user.id, username: user.username, role_id: user.roleId, role_name: user.roleRelation?.name };
  }
}
