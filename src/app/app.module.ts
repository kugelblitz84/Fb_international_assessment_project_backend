import { Module } from '@nestjs/common';
import { ConfigModule } from '../core/config/config.module';
import { PrismaModule } from '../core/database/prisma.module';
import { HealthModule } from '../features/health/health.module';

@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
