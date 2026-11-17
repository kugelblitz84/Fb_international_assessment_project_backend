import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
export async function adminWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002', 'P2034'].includes(error.code))
        throw new ConflictException('Conflicting or concurrent update.');
      if (error.code === 'P2025')
        throw new NotFoundException('Resource not found.');
      if (error.code === 'P2003')
        throw new BadRequestException('Invalid related resource.');
    }
    throw error;
  }
}
