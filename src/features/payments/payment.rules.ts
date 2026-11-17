import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Appointment, Payment, PaymentStatus } from '@prisma/client';

export const unresolvedStatuses: PaymentStatus[] = [
  'INITIATING',
  'PENDING',
  'REVIEW_REQUIRED',
];
export interface AppointmentPaymentSummary {
  paymentStatus: 'unpaid' | 'pending' | 'paid' | 'review_required';
  paymentMethod: 'sslcommerz' | null;
  canPayOnline: boolean;
}
export function paymentError(status: number, code: string, message: string) {
  return new HttpException({ statusCode: status, code, message }, status);
}
export function paymentEligible(
  a: Pick<Appointment, 'status' | 'startsAt' | 'price' | 'currency'>,
  now = new Date(),
) {
  return (
    ['PENDING', 'CONFIRMED'].includes(a.status) &&
    a.startsAt > now &&
    a.currency === 'BDT' &&
    a.price.gte(10) &&
    a.price.lte(500000)
  );
}
export function paymentSummary(
  a: Pick<Appointment, 'status' | 'startsAt' | 'price' | 'currency'>,
  payments: Pick<Payment, 'status' | 'applied'>[],
  enabled: boolean,
): AppointmentPaymentSummary {
  const review = payments.some((p) => p.status === 'REVIEW_REQUIRED');
  const paid = payments.some((p) => p.applied);
  const active = payments.some((p) =>
    ['INITIATING', 'PENDING'].includes(p.status),
  );
  return {
    paymentStatus: review
      ? 'review_required'
      : paid
        ? 'paid'
        : active
          ? 'pending'
          : 'unpaid',
    paymentMethod: paid ? 'sslcommerz' : null,
    canPayOnline: enabled && !review && !paid && !active && paymentEligible(a),
  };
}
export function assertPaymentTransition(
  payments: Pick<Payment, 'status' | 'applied'>[],
  cancelling: boolean,
) {
  if (payments.some((p) => p.status === 'REVIEW_REQUIRED'))
    throw paymentError(
      409,
      'PAYMENT_REVIEW_REQUIRED',
      'Payment requires manual support and reconciliation before changing this appointment.',
    );
  if (
    cancelling &&
    payments.some((p) => p.applied || unresolvedStatuses.includes(p.status))
  )
    throw paymentError(
      409,
      'PAYMENT_CANCELLATION_BLOCKED',
      'Paid or unresolved online payments prevent cancellation. Reconcile pending payments or contact support for a paid cancellation/refund.',
    );
}
export interface VerifiedOrder {
  status: string;
  tran_id?: string;
  val_id?: string;
  amount?: string | number;
  currency?: string;
  currency_type?: string;
  currency_amount?: string | number;
  bank_tran_id?: string;
  risk_level?: string | number;
  store_id?: string;
  sessionkey?: string;
  value_a?: string;
}
export function verificationReason(
  p: Payment,
  v: VerifiedOrder,
  storeId: string | undefined,
): string | null {
  if (!['VALID', 'VALIDATED'].includes(v.status)) return 'UNVERIFIED_STATUS';
  if (v.tran_id !== p.merchantTransactionId) return 'TRANSACTION_MISMATCH';
  if (
    !v.val_id ||
    v.val_id.length > 50 ||
    !v.bank_tran_id ||
    v.bank_tran_id.length > 80
  )
    return 'MISSING_REFERENCE';
  try {
    if (
      v.amount === undefined ||
      !new Prisma.Decimal(v.amount).equals(p.amount)
    )
      return 'AMOUNT_MISMATCH';
    if (
      v.currency_amount !== undefined &&
      !new Prisma.Decimal(v.currency_amount).equals(p.amount)
    )
      return 'AMOUNT_MISMATCH';
  } catch {
    return 'AMOUNT_MISMATCH';
  }
  if (
    v.currency !== 'BDT' ||
    (v.currency_type !== undefined && v.currency_type !== 'BDT')
  )
    return 'CURRENCY_MISMATCH';
  if (
    (v.store_id !== undefined && v.store_id !== storeId) ||
    (v.sessionkey !== undefined &&
      p.sessionKey &&
      v.sessionkey !== p.sessionKey) ||
    (v.value_a !== undefined && v.value_a !== p.id)
  )
    return 'GATEWAY_IDENTITY_MISMATCH';
  if (String(v.risk_level) !== '0') return 'GATEWAY_RISK_REVIEW';
  return null;
}
