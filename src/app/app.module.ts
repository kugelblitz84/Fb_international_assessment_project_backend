import { Module } from '@nestjs/common';
import { ConfigModule } from '../core/config/config.module';
import { PrismaModule } from '../core/database/prisma.module';
import { HealthModule } from '../features/health/health.module';
import { AuthModule } from '../core/auth/auth.module';
import { FeatureAuthModule } from '../features/auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    FeatureAuthModule,
  ],
})
export class AppModule {}
