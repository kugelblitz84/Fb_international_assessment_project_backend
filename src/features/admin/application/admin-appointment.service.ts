import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { localInstant } from '../../scheduling/domain/workshop-time';
import { SslcommerzService } from '../../payments/sslcommerz.service';
import {
  paymentSummary,
  assertPaymentTransition,
  unresolvedStatuses,
} from '../../payments/payment.rules';
const include = {
  payments: true,
  user: { select: { id: true, name: true, email: true } },
  vehicle: true,
} as const;
type Row = Prisma.AppointmentGetPayload<{ include: typeof include }>;
@Injectable()
export class AdminAppointmentService {
  constructor(
    private readonly db: PrismaService,
    private readonly gateway: SslcommerzService,
  ) {}
  private dto(row: Row) {
    const { payments, ...safe } = row;
    return {
      ...safe,
      ...paymentSummary(row, payments, this.gateway.enabled),
      canCancel:
        ['PENDING', 'CONFIRMED'].includes(row.status) &&
        !payments.some(
          (p) => p.applied || unresolvedStatuses.includes(p.status),
        ),
      status: row.status.toLowerCase(),
      basePrice: row.basePrice.toNumber(),
      price: row.price.toNumber(),
    };
  }
  async list(filters: { status?: string; date?: string }) {
    const start = filters.date
      ? localInstant(filters.date, '00:00')
      : undefined;
    return (
      await this.db.appointment.findMany({
        where: {
          status: filters.status?.toUpperCase() as
            AppointmentStatus | undefined,
          ...(start
            ? {
                startsAt: {
                  gte: start,
                  lt: new Date(start.getTime() + 86400000),
                },
              }
            : {}),
        },
        include,
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      })
    ).map((r) => this.dto(r));
  }
  async get(id: string) {
    const row = await this.db.appointment.findUnique({
      where: { id },
      include,
    });
    if (!row) throw new NotFoundException('Appointment not found.');
    return this.dto(row);
  }
  async transition(
    id: string,
    status: 'confirmed' | 'completed' | 'cancelled',
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${id}::uuid FOR UPDATE`;
      const now = new Date();
      const allowed: AppointmentStatus[] =
        status === 'confirmed'
          ? ['PENDING']
          : status === 'completed'
            ? ['CONFIRMED']
            : ['PENDING', 'CONFIRMED'];
      const previous = await tx.appointment.findUnique({
        where: { id },
        include: { payments: true },
      });
      if (!previous) throw new NotFoundException('Appointment not found.');
      assertPaymentTransition(previous.payments, status === 'cancelled');
      if (!allowed.includes(previous.status))
        throw new ConflictException('Invalid appointment transition.');
      const changed = await tx.appointment.updateMany({
        where: {
          id,
          status: previous.status,
          ...(status === 'completed' ? { endsAt: { lte: now } } : {}),
        },
        data: {
          status: status.toUpperCase() as AppointmentStatus,
          ...(status === 'cancelled' ? { cancelledAt: now } : {}),
        },
      });
      if (!changed.count) {
        if (
          !(await tx.appointment.findUnique({
            where: { id },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Appointment not found.');
        throw new ConflictException(
          'Invalid, premature or concurrent appointment transition.',
        );
      }
      return this.dto(
        await tx.appointment.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }
}
