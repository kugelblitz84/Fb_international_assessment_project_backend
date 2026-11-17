import { Module } from '@nestjs/common';
import { ConfigModule } from '../core/config/config.module';
import { PrismaModule } from '../core/database/prisma.module';
import { HealthModule } from '../features/health/health.module';
import { AuthModule } from '../core/auth/auth.module';
import { FeatureAuthModule } from '../features/auth/auth.module';
import { CatalogModule } from '../features/catalog/catalog.module';
import { SchedulingModule } from '../features/scheduling/scheduling.module';
import { AppointmentsModule } from '../features/appointments/appointments.module';
import { PlatformModule } from '../features/platform/platform.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    FeatureAuthModule,
    CatalogModule,
    SchedulingModule,
    AppointmentsModule,
    PlatformModule,
  ],
})
export class AppModule {}
