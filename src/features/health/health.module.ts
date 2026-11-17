import { Module } from '@nestjs/common';
import { ConfigModule } from '../../core/config/config.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [ConfigModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
