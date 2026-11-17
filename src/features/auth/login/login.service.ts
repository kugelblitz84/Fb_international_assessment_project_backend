import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordService } from '../data/password.service';
import { UserRepository } from '../data/user.repository';
import { SessionService } from '../../../core/auth/services/session.service';
import { publicUser } from '../../../core/auth/auth.types';
import type { SessionMetadata } from '../../../core/auth/auth.types';
@Injectable()
export class LoginService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}
  async execute(
    input: { email: string; password: string },
    metadata: SessionMetadata,
  ) {
    const user = await this.users.findForLogin(input.email);
    const valid = user
      ? await this.passwords.verify(input.password, user.passwordHash)
      : (await this.passwords.dummyVerify(input.password), false);
    if (!user || !valid || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Invalid email or password.');
    const tokens = await this.sessions.create(user.id, metadata);
    await this.users.recordLogin(user.id);
    return { user: publicUser(user), tokens };
  }
}
