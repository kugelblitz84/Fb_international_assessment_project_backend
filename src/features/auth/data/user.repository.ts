import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
const publicSelect = { role: true, id: true, name: true, email: true } as const;
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: { name: string; email: string; passwordHash: string }) {
    try {
      return await this.prisma.user.create({
        data: { ...data, role: 'CUSTOMER' },
        select: publicSelect,
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  findForLogin(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { ...publicSelect, passwordHash: true, status: true },
    });
  }
  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicSelect,
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
  async update(id: string, data: { name?: string; email?: string }) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: publicSelect,
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  recordLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
      select: { id: true },
    });
  }
  private conflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException('Email already registered.');
    throw error;
  }
}
