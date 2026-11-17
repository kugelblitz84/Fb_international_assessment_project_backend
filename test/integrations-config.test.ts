import 'reflect-metadata';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { Prisma } from '@prisma/client';
import type { Appointment, Payment } from '@prisma/client';
import { loadAppConfig } from '../src/core/config/app-config';
import { CloudinaryService } from '../src/features/media/cloudinary.service';
import { MediaService } from '../src/features/media/media.service';
import type { PrismaService } from '../src/core/database/prisma.service';
import { SslcommerzService, checkoutContact } from '../src/features/payments/sslcommerz.service';
import { paymentSummary, paymentEligible, assertPaymentTransition, verificationReason } from '../src/features/payments/payment.rules';

const env = { DATABASE_URL: 'postgresql://test@localhost/test', AUTH_ACCESS_TOKEN_SECRET: 'a'.repeat(48) };
const cloud = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' };
const ssl = { SSLCOMMERZ_STORE_ID: 'test', SSLCOMMERZ_STORE_PASSWORD: 'secret', PUBLIC_API_BASE_URL: 'https://api.example.com/api/v1' };
const p = { id: 'payment', amount: new Prisma.Decimal('1400'), merchantTransactionId: 'AC123', sessionKey: 'session' } as Payment;
const a = { status: 'PENDING', startsAt: new Date(Date.now() + 86400000), price: new Prisma.Decimal(1400), currency: 'BDT' } as Appointment;

test('optional integration configuration is all-or-none, sandbox by default and secret-free errors', () => {
  assert.equal(loadAppConfig(env).cloudinary.cloudName, undefined);
  assert.equal(loadAppConfig(env).sslcommerz.isLive, false);
  assert.equal(loadAppConfig({ ...env, ...cloud, ...ssl }).cloudinary.folder, 'autocare');
  for (const partial of [{ CLOUDINARY_CLOUD_NAME: 'test' }, { CLOUDINARY_API_KEY: 'secret' }, { SSLCOMMERZ_STORE_ID: 'secret' }, { SSLCOMMERZ_STORE_PASSWORD: 'secret' }]) {
    assert.throws(() => loadAppConfig({ ...env, ...partial }), (error: Error) => !error.message.includes('=secret'));
  }
  assert.throws(() => loadAppConfig({ ...env, SSLCOMMERZ_IS_LIVE: 'yes' }));
  assert.throws(() => loadAppConfig({ ...env, SSLCOMMERZ_TIMEOUT_MS: '0' }));
  assert.throws(() => loadAppConfig({ ...env, CLOUDINARY_FOLDER: '../bad' }));
  assert.throws(() => loadAppConfig({ ...env, PUBLIC_API_BASE_URL: 'https://api.example.com' }));
  assert.throws(() => loadAppConfig({ ...env, TRUSTED_PROXY_ADDRESSES: '10.0.0.1/99' }));
  assert.deepEqual(loadAppConfig({ ...env, TRUSTED_PROXY_ADDRESSES: '10.0.0.1,::1/128' }).trustedProxies, ['10.0.0.1', '::1/128']);
});

test('SSLCOMMERZ validation/query adapters strip card fields and safely reject unavailable queries', async () => {
  const provider = new SslcommerzService(loadAppConfig({ ...env, ...ssl }));
  const result = { status: 'VALID', tran_id: p.merchantTransactionId, sessionkey: p.sessionKey, val_id: 'val', bank_tran_id: 'bank', amount: '1400.00', currency: 'BDT', risk_level: '0', card_no: 'DO-NOT-RETAIN', card_type: 'DO-NOT-RETAIN' };
  let mode: 'validation' | 'session' | 'merchant' | 'unavailable' = 'validation';
  const stub = mock.method(globalThis, 'fetch', async (url: string) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('store_id'), 'test');
    assert.equal(parsed.searchParams.get('store_passwd'), 'secret');
    if (mode === 'validation') {
      assert.equal(parsed.pathname, '/validator/api/validationserverAPI.php'); assert.equal(parsed.searchParams.get('val_id'), 'val');
      return new Response(JSON.stringify(result));
    }
    assert.equal(parsed.pathname, '/validator/api/merchantTransIDvalidationAPI.php');
    if (mode === 'session') {
      assert.equal(parsed.searchParams.get('sessionkey'), p.sessionKey);
      return new Response(JSON.stringify({ ...result, APIConnect: 'DONE' }));
    }
    if (mode === 'merchant') {
      assert.equal(parsed.searchParams.get('tran_id'), p.merchantTransactionId);
      return new Response(JSON.stringify({ APIConnect: 'DONE', element: [result] }));
    }
    throw new Error('credential-bearing error MUST NOT LEAK');
  });
  try {
    assert.ok(!JSON.stringify(await provider.validate('val')).includes('DO-NOT-RETAIN'));
    mode = 'session'; assert.ok(!JSON.stringify(await provider.query(p)).includes('DO-NOT-RETAIN'));
    mode = 'merchant'; assert.equal((await provider.query({ ...p, sessionKey: null })).length, 1);
    mode = 'unavailable';
    await assert.rejects(() => provider.query(p), (error: Error) => !error.message.includes('MUST NOT LEAK'));
  } finally { stub.mock.restore(); }
});

test('gateway capabilities require a reachable-form HTTPS callback base and never expose secrets', () => {
  for (const url of ['', 'http://api.example.com/api/v1', 'https://127.0.0.1/api/v1', 'https://api.example.invalid/api/v1'])
    assert.equal(new SslcommerzService(loadAppConfig({ ...env, ...ssl, PUBLIC_API_BASE_URL: url })).enabled, false);
  assert.equal(new SslcommerzService(loadAppConfig({ ...env, ...ssl })).enabled, true);
  assert.throws(() => new SslcommerzService(loadAppConfig(env)).assertEnabled(), { status: 503 });
});

test('Cloudinary uploads are server-controlled, bounded, image-only and errors are safe', async () => {
  const provider = new CloudinaryService(loadAppConfig({ ...env, ...cloud }));
  await assert.rejects(() => new CloudinaryService(loadAppConfig(env)).upload(Buffer.from('image'), 'id'), { status: 503 });
  let options: Record<string, unknown> = {};
  const stub = mock.method(cloudinary.uploader, 'upload_stream', (o: Record<string, unknown>, cb: (error: unknown, value?: unknown) => void) => {
    options = o;
    const stream = new PassThrough();
    stream.on('finish', () => cb(null, { public_id: 'autocare/id', secure_url: 'https://res.cloudinary.com/test/id' }));
    stream.resume();
    return stream;
  });
  try {
    assert.deepEqual(await provider.upload(Buffer.from('image'), 'id'), { publicId: 'autocare/id', secureUrl: 'https://res.cloudinary.com/test/id' });
    assert.equal(options.resource_type, 'image'); assert.equal(options.overwrite, false); assert.equal(options.timeout, 20000);
    stub.mock.mockImplementation((_o: unknown, cb: (error: unknown) => void) => { const stream = new PassThrough(); stream.on('finish', () => cb({ message: 'secret provider payload', http_code: 499 })); stream.resume(); return stream; });
    await assert.rejects(() => provider.upload(Buffer.from('image'), 'id'), (error: Error) => !error.message.includes('secret') && error.message.includes('unavailable'));
  } finally { stub.mock.restore(); }
});

test('media persistence contains metadata only and compensates only its new upload', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64');
  let stored: any, cleaned = '', fail = false;
  const db = { mediaAsset: { create: async (input: unknown) => { stored = input; if (fail) throw new Error('db'); }, findUnique: async () => ({ data: png, mimeType: 'image/png', fileSize: png.length }) } } as unknown as PrismaService;
  const provider = { upload: async (_data: Buffer, id: string) => ({ publicId: 'autocare/' + id, secureUrl: 'https://res.cloudinary.com/' + id }), cleanup: async (id: string) => { cleaned = id; } } as CloudinaryService;
  const service = new MediaService(db, provider);
  const result = await service.upload(png);
  assert.deepEqual(Object.keys(result).sort(), ['id', 'imageUrl']);
  assert.equal(stored.data.storageProvider, 'CLOUDINARY'); assert.equal(stored.data.data, undefined);
  assert.deepEqual((await service.get('legacy')).data, png);
  fail = true;
  await assert.rejects(() => service.upload(png), { status: 503 });
  assert.equal(cleaned, stored.data.cloudinaryPublicId);
});

test('payment rules distinguish unpaid, unresolved, paid and review without changing booking status', () => {
  assert.equal(paymentSummary(a, [], true).paymentStatus, 'unpaid');
  assert.equal(paymentSummary(a, [], true).canPayOnline, true);
  for (const status of ['INITIATING', 'PENDING', 'REVIEW_REQUIRED'] as const) {
    assert.equal(paymentSummary(a, [{ status, applied: false }], true).canPayOnline, false);
    assert.throws(() => assertPaymentTransition([{ status, applied: false }], true), { status: 409 });
  }
  assert.throws(() => assertPaymentTransition([{ status: 'PAID', applied: true }], true), { status: 409 });
  assert.throws(() => assertPaymentTransition([{ status: 'REVIEW_REQUIRED', applied: false }], false), { status: 409 });
  assertPaymentTransition([{ status: 'PAID', applied: true }], false);
  for (const patch of [{ status: 'CANCELLED' }, { status: 'COMPLETED' }, { startsAt: new Date(0) }, { price: new Prisma.Decimal(0) }, { price: new Prisma.Decimal(500001) }, { currency: 'USD' }])
    assert.equal(paymentEligible({ ...a, ...patch } as Appointment), false);
});

test('verification checks exact Decimal amount, transaction, currency, references, merchant, session and risk', () => {
  const valid = { status: 'VALID', tran_id: p.merchantTransactionId, val_id: 'val', bank_tran_id: 'bank', amount: '1400.00', currency: 'BDT', risk_level: '0' };
  assert.equal(verificationReason(p, valid, 'test'), null);
  for (const patch of [{ amount: '1399.99' }, { amount: 'NaN' }, { currency: 'USD' }, { tran_id: 'forged' }, { store_id: 'other' }, { sessionkey: 'other' }, { value_a: 'other' }, { currency_amount: '1' }, { risk_level: '1' }, { risk_level: undefined }, { val_id: '' }])
    assert.ok(verificationReason(p, { ...valid, ...patch }, 'test'));
});

test('checkout contact rejects fabricated extra controls and respects provider lengths', () => {
  const contact = { phone: '01700000000', address: 'Dhaka', city: 'Dhaka', postcode: '1200' };
  assert.equal(checkoutContact.safeParse(contact).success, true);
  for (const patch of [{ amount: 1 }, { currency: 'USD' }, { owner: 'user' }, { phone: '' }, { city: 'a'.repeat(51) }]) assert.equal(checkoutContact.safeParse({ ...contact, ...patch }).success, false);
});

test('typed SSLCOMMERZ adapter uses hosted v4 and trusted callbacks, with no automatic retries', async () => {
  const provider = new SslcommerzService(loadAppConfig({ ...env, ...ssl }));
  let calls = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php');
    assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    const form = new URLSearchParams(init.body as string);
    assert.equal(form.get('total_amount'), '1400.00'); assert.equal(form.get('shipping_method'), 'NO');
    assert.equal(form.get('success_url'), ssl.PUBLIC_API_BASE_URL + '/payments/sslcommerz/success');
    return new Response(JSON.stringify({ status: 'SUCCESS', sessionkey: 'session', GatewayPageURL: 'https://sandbox.sslcommerz.com/checkout' }));
  });
  try {
    await provider.initiate(p, { name: 'Customer', email: 'customer@example.com' }, { phone: '01700000000', address: 'Dhaka', city: 'Dhaka', postcode: '1200' }, 'Wash');
    assert.equal(calls, 1);
    fetchMock.mock.mockImplementation(async () => { calls++; throw new Error('store_passwd=secret network timeout'); });
    await assert.rejects(() => provider.initiate(p, { name: 'Customer', email: 'a@example.com' }, { phone: '01700000000', address: 'Dhaka', city: 'Dhaka', postcode: '1200' }, 'Wash'), (error: Error) => !error.message.includes('secret'));
    assert.equal(calls, 2);
    assert.throws(() => provider.checkoutUrl('https://attacker.example/checkout'));
  } finally { fetchMock.mock.restore(); }
});
