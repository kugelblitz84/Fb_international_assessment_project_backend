import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { activeCatalog } from '../../catalog/data/catalog.repository';
@Injectable()
export class AdminDashboardService {
  constructor(private readonly db: PrismaService) {}
  async get() {
    const now = new Date();
    const [
      totalCategories,
      totalServices,
      activeServices,
      totalPackages,
      activeOffers,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
    ] = await this.db.$transaction([
      this.db.serviceCategory.count(),
      this.db.service.count(),
      this.db.service.count({ where: { isActive: true } }),
      this.db.service.count({ where: { type: 'PACKAGE' } }),
      this.db.offer.count({
        where: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gt: now },
          service: activeCatalog,
        },
      }),
      this.db.appointment.count({ where: { status: 'PENDING' } }),
      this.db.appointment.count({ where: { status: 'CONFIRMED' } }),
      this.db.appointment.count({ where: { status: 'COMPLETED' } }),
    ]);
    return {
      totalCategories,
      totalServices,
      activeServices,
      totalPackages,
      activeOffers,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
    };
  }
}
