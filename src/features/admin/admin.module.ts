import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminDashboardService } from './application/admin-dashboard.service';
import { AdminDashboardController } from './http/admin-dashboard.controller';
import { AdminCategoryService } from './application/admin-category.service';
import { AdminCategoryController } from './http/admin-category.controller';
import { AdminCatalogService } from './application/admin-catalog.service';
import { AdminCatalogController } from './http/admin-catalog.controller';
import { AdminOfferService } from './application/admin-offer.service';
import { AdminOfferController } from './http/admin-offer.controller';
import { AdminAppointmentService } from './application/admin-appointment.service';
import { AdminAppointmentController } from './http/admin-appointment.controller';
@Module({
  imports: [PrismaModule, CatalogModule],
  providers: [
    AdminDashboardService,
    AdminCategoryService,
    AdminCatalogService,
    AdminOfferService,
    AdminAppointmentService,
  ],
  controllers: [
    AdminDashboardController,
    AdminCategoryController,
    AdminCatalogController,
    AdminOfferController,
    AdminAppointmentController,
  ],
})
export class AdminModule {}
