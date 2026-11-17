import { Injectable } from '@nestjs/common';
import { PasswordService } from '../data/password.service';
import { UserRepository } from '../data/user.repository';
import { SessionService } from '../../../core/auth/services/session.service';
import type { SessionMetadata } from '../../../core/auth/auth.types';
@Injectable()
export class RegisterService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}
  async execute(
    input: { name: string; email: string; password: string },
    metadata: SessionMetadata,
  ) {
    const user = await this.users.create({
      name: input.name,
      email: input.email,
      passwordHash: await this.passwords.hash(input.password),
    });
    return { user, tokens: await this.sessions.create(user.id, metadata) };
  }
}
