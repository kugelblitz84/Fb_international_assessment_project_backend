import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import { AccessTokenService } from '../services/access-token.service';
import { SessionService } from '../services/session.service';
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessTokenService,
    private readonly sessions: SessionService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.get('authorization');
    if (
      !header &&
      this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets)
    )
      return true;
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match)
      throw new UnauthorizedException('A valid access token is required.');
    request.user = await this.sessions.authenticateAccessToken(
      await this.access.verify(match[1]),
    );
    return true;
  }
}
