import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { activeCatalog } from '../../catalog/data/catalog.repository';
@Injectable()
export class SchedulingRepository {
  constructor(private readonly prisma: PrismaService) {}
  async context(serviceId: string, dayOfWeek: number) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, ...activeCatalog },
      select: { id: true, durationMinutes: true },
    });
    if (!service) throw new NotFoundException('Service not found.');
    const [bays, hours] = await Promise.all([
      this.prisma.serviceBay.findMany({
        where: { isActive: true },
        select: { id: true },
      }),
      this.prisma.businessHours.findMany({
        where: { dayOfWeek, isClosed: false },
        select: { opensAt: true, closesAt: true, isClosed: true },
      }),
    ]);
    return { service, bays, hours };
  }
  async persist(
    slots: { serviceId: string; bayId: string; startsAt: Date; endsAt: Date }[],
  ) {
    if (slots.length)
      await this.prisma.appointmentSlot.createMany({
        data: slots,
        skipDuplicates: true,
      });
  }
  slots(serviceId: string, startsAt: Date, endsAt: Date) {
    return this.prisma.appointmentSlot.findMany({
      where: {
        serviceId,
        startsAt: { gte: startsAt, lt: endsAt },
        isActive: true,
        bay: { isActive: true },
      },
      select: { id: true, bayId: true, startsAt: true, endsAt: true },
      orderBy: [{ startsAt: 'asc' }, { bayId: 'asc' }, { id: 'asc' }],
    });
  }
  reservations(startsAt: Date, endsAt: Date) {
    return this.prisma.appointment.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { bayId: true, startsAt: true, endsAt: true },
    });
  }
}
