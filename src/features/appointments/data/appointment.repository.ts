import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Appointment } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import type { AppConfig } from '../../../core/config/app-config';
import {
  activeCatalog,
  catalogRecord,
  CatalogRepository,
} from '../../catalog/data/catalog.repository';
import type {
  CatalogServiceRecord,
  Money,
} from '../../catalog/domain/catalog.types';
import {
  assertBookingDate,
  insideBusinessHours,
  workshopDate,
  workshopTime,
  WORKSHOP_TIME_ZONE,
} from '../../scheduling/domain/workshop-time';
import type {
  AppointmentDto,
  AppointmentFilters,
  CreateAppointment,
} from '../domain/appointment.types';
function dto(row: Appointment): AppointmentDto {
  return {
    id: row.id,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    status: row.status.toLowerCase() as AppointmentDto['status'],
    slot: {
      id: row.slotId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      workshopTime: workshopTime(row.startsAt),
      timeZone: WORKSHOP_TIME_ZONE,
      available: false,
    },
    vehicleId: row.vehicleId,
    originalPrice: row.basePrice.toNumber(),
    price: row.price.toNumber(),
    currency: row.currency,
    durationMinutes: row.durationMinutes,
    appliedOfferId: row.appliedOfferId,
    canCancel: row.status === 'PENDING',
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}
export function isReservationConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  )
    return true;
  if (typeof error !== 'object' || error === null) return false;
  const record = error as Record<string, unknown>;
  if (
    record.code === '23P01' ||
    record.originalCode === '23P01' ||
    record.code === '23505' ||
    record.originalCode === '23505'
  )
    return true;
  return ['cause', 'meta', 'driverAdapterError'].some((key) =>
    isReservationConflict(record[key]),
  );
}
@Injectable()
export class AppointmentRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async reserve(
    userId: string,
    input: CreateAppointment,
    calculate: (
      service: CatalogServiceRecord,
      now: Date,
    ) => { price: Money; offer: { id: string } | null },
  ) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const service = await tx.service.findFirst({
          where: { id: input.serviceId, ...activeCatalog },
          include: CatalogRepository.bookingInclude,
        });
        if (!service) throw new NotFoundException('Service not found.');
        const slot = await tx.appointmentSlot.findFirst({
          where: {
            id: input.slotId,
            serviceId: input.serviceId,
            isActive: true,
            bay: { isActive: true },
          },
        });
        if (!slot)
          throw new NotFoundException('Slot not found for this service.');
        assertBookingDate(
          workshopDate(slot.startsAt),
          this.config.booking.horizonDays,
          now,
        );
        if (
          slot.startsAt <= now ||
          slot.endsAt.getTime() - slot.startsAt.getTime() !==
            service.durationMinutes * 60000
        )
          throw new BadRequestException('Slot is no longer bookable.');
        const dayOfWeek = new Date(
          `${workshopDate(slot.startsAt)}T00:00:00Z`,
        ).getUTCDay();
        const hours = await tx.businessHours.findMany({ where: { dayOfWeek } });
        if (!insideBusinessHours(slot.startsAt, slot.endsAt, hours))
          throw new BadRequestException(
            'Slot is outside current business hours.',
          );
        if (
          input.vehicleId &&
          !(await tx.vehicle.findFirst({
            where: { id: input.vehicleId, userId },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Vehicle not found.');
        const pricing = calculate(catalogRecord(service), now);
        // The exclusion constraint and partial unique index serialize conflicting inserts.
        return tx.appointment.create({
          data: {
            userId,
            serviceId: service.id,
            slotId: slot.id,
            vehicleId: input.vehicleId,
            bayId: slot.bayId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            serviceName: service.name,
            basePrice: service.price,
            price: pricing.price,
            currency: service.currency,
            durationMinutes: service.durationMinutes,
            appliedOfferId: pricing.offer?.id,
          },
        });
      });
      return dto(row);
    } catch (error) {
      if (isReservationConflict(error))
        throw new ConflictException(
          'The selected capacity has already been reserved.',
        );
      throw error;
    }
  }
  async list(userId: string, filters: AppointmentFilters) {
    const now = new Date();
    const where: Prisma.AppointmentWhereInput = { userId };
    if (filters.status)
      where.status =
        filters.status.toUpperCase() as Prisma.EnumAppointmentStatusFilter['equals'];
    if (filters.period === 'upcoming') {
      where.startsAt = { gt: now };
      where.AND = [{ status: { in: ['PENDING', 'CONFIRMED'] } }];
    }
    if (filters.period === 'previous')
      where.OR = [
        { startsAt: { lte: now } },
        { status: { in: ['CANCELLED', 'COMPLETED'] } },
      ];
    return (
      await this.prisma.appointment.findMany({
        where,
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      })
    ).map(dto);
  }
  async getOwned(userId: string, id: string) {
    const row = await this.prisma.appointment.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Appointment not found.');
    return dto(row);
  }
  async cancel(userId: string, id: string) {
    const changed = await this.prisma.appointment.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (!changed.count) {
      await this.getOwned(userId, id);
      throw new ConflictException(
        'Only pending appointments can be cancelled.',
      );
    }
    return this.getOwned(userId, id);
  }
}
