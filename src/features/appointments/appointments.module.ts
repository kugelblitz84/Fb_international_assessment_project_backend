import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AppointmentService } from './application/appointment.service';
import { AppointmentRepository } from './data/appointment.repository';
import { AppointmentController } from './http/appointment.controller';
@Module({
  imports: [PrismaModule, CatalogModule],
  providers: [AppointmentRepository, AppointmentService],
  controllers: [AppointmentController],
  exports: [AppointmentService],
})
export class AppointmentsModule {}
