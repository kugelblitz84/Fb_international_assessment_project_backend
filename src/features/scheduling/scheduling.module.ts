import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AvailabilityService } from './application/availability.service';
import { SchedulingRepository } from './data/scheduling.repository';
import { AvailabilityController } from './http/availability.controller';
@Module({
  imports: [PrismaModule],
  providers: [SchedulingRepository, AvailabilityService],
  controllers: [AvailabilityController],
  exports: [AvailabilityService],
})
export class SchedulingModule {}
