import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG } from '../../core/config/app-config';
import type { AppConfig } from '../../core/config/app-config';
import type { Payment } from '@prisma/client';
import { paymentError } from './payment.rules';

export const checkoutContact = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,19}$/),
    address: z.string().trim().min(1).max(50),
    city: z.string().trim().min(1).max(50),
    postcode: z.string().trim().min(1).max(30),
  })
  .strict();
export type CheckoutContact = z.infer<typeof checkoutContact>;
const order = z.object({
  status: z.string(),
  tran_id: z.string().optional(),
  val_id: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  currency_type: z.string().optional(),
  currency_amount: z.union([z.string(), z.number()]).optional(),
  bank_tran_id: z.string().optional(),
  risk_level: z.union([z.string(), z.number()]).optional(),
  store_id: z.string().optional(),
  sessionkey: z.string().optional(),
  value_a: z.string().optional(),
});

@Injectable()
export class SslcommerzService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  get enabled() {
    return !!(
      this.config.sslcommerz.storeId &&
      this.config.sslcommerz.storePassword &&
      this.callbackBase()
    );
  }
  private callbackBase() {
    const base = this.config.publicApiBaseUrl;
    if (!base) return undefined;
    const url = new URL(base);
    // Local/loopback/private hosts cannot receive gateway notifications.
    if (
      url.protocol !== 'https:' ||
      !url.hostname.includes('.') ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        url.hostname,
      ) ||
      /\.(localhost|local|invalid|test)$/.test(url.hostname) ||
      base.length + 40 > 255
    )
      return undefined;
    return base;
  }
  assertEnabled() {
    if (!this.enabled)
      throw paymentError(
        503,
        'PAYMENTS_DISABLED',
        'Online payments require gateway credentials and an externally reachable HTTPS PUBLIC_API_BASE_URL including /api/v1. Pay at workshop remains available.',
      );
  }
  private get base() {
    return this.config.sslcommerz.isLive
      ? 'https://securepay.sslcommerz.com'
      : 'https://sandbox.sslcommerz.com';
  }
  private async request(
    path: string,
    fields: Record<string, string>,
    post = false,
  ): Promise<unknown> {
    const c = this.config.sslcommerz;
    if (!c.storeId || !c.storePassword)
      throw paymentError(
        503,
        'PAYMENTS_DISABLED',
        'Online payment credentials are unavailable.',
      );
    const params = new URLSearchParams({
      ...fields,
      store_id: c.storeId,
      store_passwd: c.storePassword,
      format: 'json',
    });
    try {
      const result = await fetch(
        this.base + path + (post ? '' : '?' + params.toString()),
        {
          method: post ? 'POST' : 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(c.timeoutMs),
          ...(post
            ? {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
              }
            : {}),
        },
      );
      if (!result.ok) throw new Error('Gateway unavailable');
      return await result.json();
    } catch {
      // Do not attach the cause: fetch errors can include credential-bearing URLs.
      throw paymentError(
        503,
        'PAYMENT_GATEWAY_UNAVAILABLE',
        'Gateway verification is unavailable. Refresh payment status before trying another payment.',
      );
    }
  }
  checkoutUrl(value: string) {
    const url = new URL(value);
    const hosts = this.config.sslcommerz.isLive
      ? ['securepay.sslcommerz.com', 'engine.sslcommerz.com']
      : ['sandbox.sslcommerz.com', 'sandbox-gw.sslcommerz.com'];
    if (
      url.protocol !== 'https:' ||
      !hosts.includes(url.hostname) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      throw new Error('Invalid checkout URL');
    return value;
  }
  async initiate(
    p: Payment,
    customer: { name: string; email: string },
    contact: CheckoutContact,
    serviceName: string,
  ) {
    this.assertEnabled();
    if (customer.name.length > 50 || customer.email.length > 50)
      throw paymentError(
        422,
        'PAYMENT_CONTACT_UNSUPPORTED',
        'SSLCOMMERZ requires customer name and email of at most 50 characters. Update your profile or pay at workshop.',
      );
    const callback = (suffix: string) =>
      `${this.callbackBase()}/payments/sslcommerz/${suffix}`;
    const raw = await this.request(
      '/gwprocess/v4/api.php',
      {
        total_amount: p.amount.toFixed(2),
        currency: 'BDT',
        tran_id: p.merchantTransactionId,
        success_url: callback('success'),
        fail_url: callback('fail'),
        cancel_url: callback('cancel'),
        ipn_url: callback('ipn'),
        cus_name: customer.name,
        cus_email: customer.email,
        cus_phone: contact.phone,
        cus_add1: contact.address,
        cus_city: contact.city,
        cus_postcode: contact.postcode,
        cus_country: 'Bangladesh',
        shipping_method: 'NO',
        num_of_item: '1',
        product_name: serviceName.slice(0, 255),
        product_category: 'Vehicle workshop service',
        product_profile: 'non-physical-goods',
        value_a: p.id,
      },
      true,
    );
    const parsed = z
      .object({
        status: z.literal('SUCCESS'),
        sessionkey: z.string().min(1).max(200),
        GatewayPageURL: z.string().url(),
      })
      .safeParse(raw);
    if (!parsed.success)
      throw paymentError(
        503,
        'PAYMENT_INITIATION_UNCERTAIN',
        'Checkout could not be established. Reconcile this payment before retrying.',
      );
    try {
      return {
        sessionKey: parsed.data.sessionkey,
        checkoutUrl: this.checkoutUrl(parsed.data.GatewayPageURL),
      };
    } catch {
      throw paymentError(
        503,
        'PAYMENT_INITIATION_UNCERTAIN',
        'Checkout URL was invalid. Reconcile this payment before retrying.',
      );
    }
  }
  async validate(validationId: string) {
    const raw = await this.request('/validator/api/validationserverAPI.php', {
      val_id: validationId,
      v: '1',
    });
    const parsed = order.safeParse(raw);
    if (!parsed.success)
      throw paymentError(
        503,
        'PAYMENT_VERIFICATION_UNAVAILABLE',
        'Unable to verify gateway response.',
      );
    return parsed.data;
  }
  async query(p: Payment) {
    const raw = await this.request(
      '/validator/api/merchantTransIDvalidationAPI.php',
      p.sessionKey
        ? { sessionkey: p.sessionKey, v: '1' }
        : { tran_id: p.merchantTransactionId, v: '1' },
    );
    if (p.sessionKey) {
      const result = order
        .extend({ APIConnect: z.literal('DONE') })
        .safeParse(raw);
      if (
        result.success &&
        result.data.tran_id === p.merchantTransactionId &&
        result.data.sessionkey === p.sessionKey
      )
        return [result.data];
    } else {
      const result = z
        .object({
          APIConnect: z.literal('DONE'),
          element: z.array(order).max(100),
        })
        .safeParse(raw);
      if (result.success) return result.data.element;
    }
    throw paymentError(
      503,
      'PAYMENT_VERIFICATION_UNAVAILABLE',
      'Gateway status is not yet available. Try reconciliation later.',
    );
  }
}
