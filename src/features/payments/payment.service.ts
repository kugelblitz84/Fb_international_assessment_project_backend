import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Payment, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { APP_CONFIG } from '../../core/config/app-config';
import type { AppConfig } from '../../core/config/app-config';
import type { AuthenticatedUser } from '../../core/auth/auth.types';
import { RateLimitService } from '../../core/auth/services/rate-limit.service';
import { SslcommerzService } from './sslcommerz.service';
import type { CheckoutContact } from './sslcommerz.service';
import {
  paymentEligible,
  paymentError,
  unresolvedStatuses,
  verificationReason,
} from './payment.rules';
import type { VerifiedOrder } from './payment.rules';

export function paymentDto(p: Payment) {
  return {
    paymentId: p.id,
    appointmentId: p.appointmentId,
    provider: 'sslcommerz',
    status: p.status.toLowerCase(),
    amount: p.amount.toNumber(),
    currency: p.currency,
    checkoutUrl: p.status === 'PENDING' ? p.checkoutUrl : null,
    paidAt: p.paidAt?.toISOString() ?? null,
    applied: p.applied,
    reasonCode: p.failureReason,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
const adminInclude = {
  appointment: {
    select: {
      user: { select: { name: true, email: true } },
      serviceName: true,
    },
  },
} as const;
@Injectable()
export class PaymentService {
  constructor(
    private readonly db: PrismaService,
    private readonly gateway: SslcommerzService,
    private readonly rate: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  capabilities() {
    return {
      onlinePaymentEnabled: this.gateway.enabled,
      provider: 'sslcommerz',
      sandbox: !this.config.sslcommerz.isLive,
      payAtWorkshopEnabled: true,
    };
  }
  private throttle(scope: string, userId: string) {
    try {
      this.rate.enforce(scope, userId, 30);
    } catch {
      throw paymentError(
        429,
        'PAYMENT_RATE_LIMITED',
        'Too many payment requests. Try again later.',
      );
    }
  }
  async initiate(
    appointmentId: string,
    auth: AuthenticatedUser,
    contact: CheckoutContact,
  ) {
    this.gateway.assertEnabled();
    this.throttle('payment-initiate', auth.userId);
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
      const a = await tx.appointment.findFirst({
        where: { id: appointmentId, userId: auth.userId },
        include: {
          user: { select: { name: true, email: true } },
          payments: true,
        },
      });
      if (!a)
        throw paymentError(
          404,
          'APPOINTMENT_NOT_FOUND',
          'Appointment not found.',
        );
      if (!paymentEligible(a))
        throw paymentError(
          409,
          'PAYMENT_NOT_ELIGIBLE',
          'Online payment requires a future pending/confirmed appointment priced between BDT 10 and 500000. Pay at workshop remains available.',
        );
      if (a.payments.some((p) => p.applied))
        throw paymentError(
          409,
          'APPOINTMENT_ALREADY_PAID',
          'This appointment already has an applied payment.',
        );
      if (a.payments.some((p) => p.status === 'REVIEW_REQUIRED'))
        throw paymentError(
          409,
          'PAYMENT_REVIEW_REQUIRED',
          'An earlier payment requires manual reconciliation.',
        );
      const active = a.payments.find((p) =>
        unresolvedStatuses.includes(p.status),
      );
      if (active) {
        if (active.status === 'PENDING' && active.checkoutUrl)
          return { payment: active, existing: true, a };
        throw paymentError(
          409,
          'PAYMENT_UNRESOLVED',
          'A payment request is unresolved. Reconcile it before retrying.',
        );
      }
      // Fail unsupported profiles before reserving an attempt or calling the gateway.
      if (a.user.name.length > 50 || a.user.email.length > 50)
        throw paymentError(
          422,
          'PAYMENT_CONTACT_UNSUPPORTED',
          'Gateway customer name and email must be at most 50 characters. Update your profile or pay at workshop.',
        );
      const payment = await tx.payment.create({
        data: {
          appointmentId,
          amount: a.price,
          currency: 'BDT',
          merchantTransactionId: 'AC' + randomBytes(14).toString('hex'),
        },
      });
      return { payment, existing: false, a };
    });
    if (result.existing) return paymentDto(result.payment);
    let session: { sessionKey: string; checkoutUrl: string };
    try {
      session = await this.gateway.initiate(
        result.payment,
        result.a.user,
        contact,
        result.a.serviceName,
      );
    } catch {
      // A request may have reached the provider even when no response arrived.
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
        await tx.payment.updateMany({
          where: { id: result.payment.id, status: 'INITIATING' },
          data: {
            status: 'REVIEW_REQUIRED',
            failureReason: 'INITIATION_UNCERTAIN',
          },
        });
      });
      throw paymentError(
        503,
        'PAYMENT_INITIATION_UNCERTAIN',
        'The gateway outcome is uncertain. Retrieve appointment payments and reconcile the saved attempt before another payment.',
      );
    }
    const saved = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
      // A validated IPN may have arrived before session creation returned.
      await tx.payment.updateMany({
        where: { id: result.payment.id, status: 'INITIATING' },
        data: { ...session, status: 'PENDING' },
      });
      return tx.payment.findUniqueOrThrow({ where: { id: result.payment.id } });
    });
    return paymentDto(saved);
  }
  private async owned(id: string, auth: AuthenticatedUser) {
    const p = await this.db.payment.findFirst({
      where: {
        id,
        ...(auth.role === 'ADMIN'
          ? {}
          : { appointment: { userId: auth.userId } }),
      },
    });
    if (!p) throw paymentError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    return p;
  }
  async get(id: string, auth: AuthenticatedUser) {
    return paymentDto(await this.owned(id, auth));
  }
  async listOwned(appointmentId: string, auth: AuthenticatedUser) {
    if (
      !(await this.db.appointment.findFirst({
        where: { id: appointmentId, userId: auth.userId },
        select: { id: true },
      }))
    )
      throw paymentError(
        404,
        'APPOINTMENT_NOT_FOUND',
        'Appointment not found.',
      );
    return (
      await this.db.payment.findMany({
        where: { appointmentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      })
    ).map(paymentDto);
  }
  private adminDto(
    p: Prisma.PaymentGetPayload<{ include: typeof adminInclude }>,
  ) {
    const { checkoutUrl, ...safe } = paymentDto(p);
    void checkoutUrl;
    return {
      ...safe,
      merchantTransactionId: p.merchantTransactionId,
      validationId: p.validationId,
      bankTransactionId: p.bankTransactionId,
      customer: p.appointment.user,
      serviceName: p.appointment.serviceName,
      lastReconciledAt: p.lastReconciledAt?.toISOString() ?? null,
      gatewayIncidents: p.gatewayIncidents,
    };
  }
  async adminList(filters: {
    status?: PaymentStatus;
    from?: string;
    to?: string;
  }) {
    return (
      await this.db.payment.findMany({
        where: {
          status: filters.status,
          createdAt: {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to ? new Date(filters.to) : undefined,
          },
        },
        include: adminInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      })
    ).map((p) => this.adminDto(p));
  }
  async adminGet(id: string) {
    const p = await this.db.payment.findUnique({
      where: { id },
      include: adminInclude,
    });
    if (!p) throw paymentError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    return this.adminDto(p);
  }
  async reconcile(id: string, auth: AuthenticatedUser) {
    const p = await this.owned(id, auth);
    this.throttle('payment-reconcile-user', auth.userId);
    await this.claimReconciliation(p.id);
    await this.queryAndApply(p);
    return auth.role === 'ADMIN' ? this.adminGet(id) : this.get(id, auth);
  }
  private async claimReconciliation(id: string) {
    const now = new Date();
    const changed = await this.db.payment.updateMany({
      where: {
        id,
        OR: [
          { lastReconciledAt: null },
          { lastReconciledAt: { lt: new Date(now.getTime() - 5000) } },
        ],
      },
      data: { lastReconciledAt: now },
    });
    if (!changed.count)
      throw paymentError(
        429,
        'PAYMENT_RECONCILE_THROTTLED',
        'Wait five seconds before refreshing this payment again.',
      );
  }
  private async queryAndApply(p: Payment) {
    const orders = await this.gateway.query(p);
    const successful = orders.filter((v) =>
      ['VALID', 'VALIDATED'].includes(v.status),
    );
    if (successful.length) {
      for (const v of successful) {
        if (!v.val_id)
          throw paymentError(
            503,
            'PAYMENT_VERIFICATION_UNAVAILABLE',
            'Gateway validation reference is unavailable.',
          );
        await this.verifyAndApply(p, v.val_id);
      }
      return;
    }
    // A merchant-ID query can list failed card attempts within a still-open session.
    // Only a terminal result for the saved session may release the checkout.
    const terminal = orders[0];
    if (
      p.sessionKey &&
      orders.length === 1 &&
      terminal &&
      terminal.tran_id === p.merchantTransactionId &&
      terminal.sessionkey === p.sessionKey &&
      ['FAILED', 'CANCELLED', 'EXPIRED'].includes(terminal.status)
    ) {
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${p.appointmentId}::uuid FOR UPDATE`;
        await tx.payment.updateMany({
          where: {
            id: p.id,
            status: { in: ['INITIATING', 'PENDING'] },
            applied: false,
          },
          data: {
            status: terminal.status as PaymentStatus,
            failureReason: 'GATEWAY_' + terminal.status,
          },
        });
      });
    }
  }
  private async verifyAndApply(p: Payment, validationId: string) {
    const verified = await this.gateway.validate(validationId);
    // Forged or mismatched validation IDs cannot mutate a payment.
    if (
      !['VALID', 'VALIDATED'].includes(verified.status) ||
      verified.tran_id !== p.merchantTransactionId ||
      verified.val_id !== validationId
    )
      throw paymentError(
        400,
        'PAYMENT_INVALID_NOTIFICATION',
        'Gateway notification could not be verified.',
      );
    await this.applyVerified(p.id, verified);
  }
  private async applyVerified(id: string, v: VerifiedOrder) {
    const original = await this.db.payment.findUniqueOrThrow({ where: { id } });
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${original.appointmentId}::uuid FOR UPDATE`;
        const p = await tx.payment.findUniqueOrThrow({ where: { id } });
        const a = await tx.appointment.findUniqueOrThrow({
          where: { id: p.appointmentId },
          include: { payments: true },
        });
        const reason = verificationReason(p, v, this.config.sslcommerz.storeId);
        if (
          p.validationId === v.val_id &&
          p.bankTransactionId === v.bank_tran_id &&
          ((p.applied && !reason) || p.status === 'REVIEW_REQUIRED')
        )
          return;
        const additional = !!p.validationId && p.validationId !== v.val_id;
        const incident =
          reason ||
          (additional ? 'ADDITIONAL_CHARGE' : null) ||
          (a.status === 'CANCELLED' || a.status === 'COMPLETED'
            ? 'LATE_PAYMENT'
            : null) ||
          (a.payments.some((other) => other.id !== p.id && other.applied)
            ? 'DUPLICATE_APPOINTMENT_CHARGE'
            : null);
        const stickyReview =
          p.status === 'REVIEW_REQUIRED' &&
          p.failureReason !== 'INITIATION_UNCERTAIN';
        if (incident || stickyReview) {
          const refs = Array.isArray(p.gatewayIncidents)
            ? p.gatewayIncidents
            : [];
          const ref = {
            validationId: v.val_id ?? '',
            bankTransactionId: v.bank_tran_id ?? '',
            reasonCode: incident ?? p.failureReason ?? 'MANUAL_REVIEW',
          };
          if (
            !refs.some(
              (r) =>
                r &&
                typeof r === 'object' &&
                !Array.isArray(r) &&
                r.validationId === ref.validationId,
            )
          )
            refs.push(ref);
          await tx.payment.update({
            where: { id },
            data: {
              status: 'REVIEW_REQUIRED',
              failureReason: incident ?? p.failureReason,
              gatewayIncidents: refs,
              // Keep the original applied charge and its reference immutable on additional charges.
              ...(!p.validationId &&
              (!reason || reason === 'GATEWAY_RISK_REVIEW')
                ? {
                    validationId: v.val_id,
                    bankTransactionId: v.bank_tran_id,
                    paidAt: new Date(),
                  }
                : {}),
            },
          });
          return;
        }
        await tx.payment.update({
          where: { id },
          data: {
            status: 'PAID',
            applied: true,
            validationId: v.val_id,
            bankTransactionId: v.bank_tran_id,
            paidAt: new Date(),
            failureReason: null,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Reused references are never accepted as another paid transaction.
        await this.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${original.appointmentId}::uuid FOR UPDATE`;
          await tx.payment.update({
            where: { id },
            data: {
              status: 'REVIEW_REQUIRED',
              failureReason: 'GATEWAY_REFERENCE_COLLISION',
            },
          });
        });
        return;
      }
      throw error;
    }
  }
  async callback(body: unknown) {
    if (!body || typeof body !== 'object')
      throw paymentError(
        400,
        'PAYMENT_INVALID_NOTIFICATION',
        'Invalid gateway notification.',
      );
    const fields = body as Record<string, unknown>;
    if (
      typeof fields.tran_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,30}$/.test(fields.tran_id)
    )
      throw paymentError(
        400,
        'PAYMENT_INVALID_NOTIFICATION',
        'Invalid transaction reference.',
      );
    const p = await this.db.payment.findUnique({
      where: { merchantTransactionId: fields.tran_id },
    });
    if (!p)
      throw paymentError(
        400,
        'PAYMENT_INVALID_NOTIFICATION',
        'Unknown transaction reference.',
      );
    if (
      p.validationId &&
      fields.val_id === p.validationId &&
      (p.applied || p.status === 'REVIEW_REQUIRED')
    )
      return;
    await this.claimReconciliation(p.id);
    if (
      typeof fields.val_id === 'string' &&
      /^[A-Za-z0-9_-]{1,50}$/.test(fields.val_id)
    )
      await this.verifyAndApply(p, fields.val_id);
    else await this.queryAndApply(p);
  }
}
