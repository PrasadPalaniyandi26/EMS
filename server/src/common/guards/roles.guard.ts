import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const userRoleName = (user?.role_name || '').toLowerCase();
    const userLegacyRole = (user?.role || '').toLowerCase();
    // Case-insensitive check — decorator uses 'admin', DB role_name is 'Admin'
    return requiredRoles.some((r) => r.toLowerCase() === userRoleName || r.toLowerCase() === userLegacyRole);
  }
}
