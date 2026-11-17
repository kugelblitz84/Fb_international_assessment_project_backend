import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Payment } from '@prisma/client';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/bootstrap';
import { PrismaService } from '../../src/core/database/prisma.service';
import { SslcommerzService } from '../../src/features/payments/sslcommerz.service';
import type { VerifiedOrder } from '../../src/features/payments/payment.rules';

test('hosted payments, callback validation, cancellation races, retries and admin access', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('hex');
  process.env.SSLCOMMERZ_STORE_ID = 'test-store';
  process.env.SSLCOMMERZ_STORE_PASSWORD = 'test-secret';
  process.env.PUBLIC_API_BASE_URL = 'https://api.example.com/api/v1';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api/v1', db = app.get(PrismaService), gateway = app.get(SslcommerzService);
  const users: string[] = [], appointments: string[] = [];
  let serviceId = '', categoryId = '', bayId = '', counter = 0, initiations = 0, shouldTimeout = false;
  let release: (() => void) | undefined, gate: Promise<void> | undefined;
  const validation = new Map<string, VerifiedOrder>(), query = new Map<string, VerifiedOrder[]>();
  gateway.initiate = async (payment, user, contact) => {
    initiations++;
    assert.ok(user.email); assert.equal(contact.phone, '01700000000');
    if (gate) await gate;
    if (shouldTimeout) throw new Error('mock ambiguous timeout');
    return { sessionKey: 'session-' + payment.id, checkoutUrl: 'https://sandbox.sslcommerz.com/checkout/' + payment.id };
  };
  gateway.validate = async (id) => validation.get(id) ?? { status: 'INVALID_TRANSACTION' };
  gateway.query = async (payment) => {
    const result = query.get(payment.id);
    if (!result) throw new Error('mock unavailable');
    return result;
  };
  const req = (path: string, token = '', body?: unknown, method?: string) => fetch(base + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = async (response: Response, status = 200): Promise<any> => { assert.equal(response.status, status, await response.clone().text()); return response.json(); };
  const contact = { phone: '01700000000', address: 'Dhaka', city: 'Dhaka', postcode: '1200' };
  try {
    const customers = [];
    for (let i = 0; i < 3; i++) {
      const data = await json(await req('/auth/register', '', { name: 'Payment customer', email: `pay-${randomBytes(6).toString('hex')}@example.com`, password: 'long-test-password' }), 201);
      users.push(data.user.id); customers.push(data);
    }
    const owner = customers[0].accessToken, other = customers[1].accessToken, admin = customers[2].accessToken;
    await db.user.update({ where: { id: users[2] }, data: { role: 'ADMIN' } });
    categoryId = (await db.serviceCategory.create({ data: { name: 'Payment tests', slug: 'pay-' + randomUUID() } })).id;
    serviceId = (await db.service.create({ data: { categoryId, name: 'Original wash', slug: 'pay-' + randomUUID(), description: 'Test', price: 1400, currency: 'BDT', durationMinutes: 60, type: 'INDIVIDUAL' } })).id;
    bayId = (await db.serviceBay.create({ data: { name: 'Payment test ' + randomUUID() } })).id;
    const appointment = async (patch: Record<string, unknown> = {}) => {
      counter++;
      const startsAt = new Date(Date.now() + 86400000 + counter * 7200000), endsAt = new Date(startsAt.getTime() + 3600000);
      const slot = await db.appointmentSlot.create({ data: { serviceId, bayId, startsAt, endsAt } });
      const row = await db.appointment.create({ data: { userId: users[0], serviceId, slotId: slot.id, bayId, startsAt, endsAt, serviceName: 'Original wash', basePrice: 1400, price: 1400, currency: 'BDT', durationMinutes: 60, ...patch } });
      appointments.push(row.id); return row;
    };
    const unlock = (id: string) => db.payment.update({ where: { id }, data: { lastReconciledAt: new Date(0) } });
    const paidOrder = async (id: string, patch: Partial<VerifiedOrder> = {}) => {
      const p = await db.payment.findUniqueOrThrow({ where: { id } });
      const val = 'val-' + randomBytes(8).toString('hex');
      const v: VerifiedOrder = { status: 'VALID', tran_id: p.merchantTransactionId, val_id: val, bank_tran_id: 'bank-' + randomBytes(8).toString('hex'), amount: p.amount.toFixed(2), currency: 'BDT', currency_type: 'BDT', risk_level: '0', store_id: 'test-store', sessionkey: p.sessionKey ?? undefined, value_a: p.id, ...patch };
      validation.set(val, v); return { p, val, v };
    };
    const ipn = async (id: string, patch: Partial<VerifiedOrder> = {}) => {
      const { p, val, v } = await paidOrder(id, patch);
      await unlock(id);
      const response = await fetch(base + '/payments/sslcommerz/ipn', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tran_id: p.merchantTransactionId, val_id: val, amount: '0.01', status: 'FAILED' }) });
      return { response, p, val, v };
    };
    const pay = async (id: string) => json(await req('/appointments/' + id + '/pay', owner, contact));
    const config = await json(await req('/payments/config'));
    assert.deepEqual(config, { onlinePaymentEnabled: true, provider: 'sslcommerz', sandbox: true, payAtWorkshopEnabled: true });
    assert.ok(!JSON.stringify(config).includes('test-secret'));
    const first = await appointment();
    assert.equal((await req('/appointments/' + first.id + '/pay', '', contact)).status, 401);
    assert.equal((await req('/appointments/' + first.id + '/pay', other, contact)).status, 404);
    assert.equal((await req('/appointments/' + first.id + '/pay', owner, { ...contact, amount: 1 })).status, 400);
    assert.equal((await req('/admin/payments', owner)).status, 403);
    for (const patch of [{ status: 'CANCELLED' }, { status: 'COMPLETED' }, { startsAt: new Date(0) }, { price: 0 }, { price: 9.99 }, { price: 500001 }]) {
      // Keep slot capacity ranges valid when exercising past bookings.
      const row = await appointment(patch.startsAt ? { startsAt: new Date(0), endsAt: new Date(3600000) } : patch);
      assert.equal((await req('/appointments/' + row.id + '/pay', owner, contact)).status, 409);
    }
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => req('/appointments/' + first.id + '/pay', owner, contact)));
    const attempts = await db.payment.findMany({ where: { appointmentId: first.id } });
    assert.equal(attempts.length, 1); assert.equal(initiations, 1);
    assert.ok(concurrent.every((r) => [200, 409].includes(r.status)));
    const p = attempts[0];
    assert.equal(p.amount.toFixed(2), '1400.00'); assert.equal(p.currency, 'BDT'); assert.equal(p.merchantTransactionId.length, 30);
    assert.equal((await pay(first.id)).paymentId, p.id);
    assert.equal((await req('/appointments/' + first.id + '/cancel', owner, {}, 'PATCH')).status, 409);
    assert.equal((await req('/admin/appointments/' + first.id + '/status', admin, { status: 'cancelled' }, 'PATCH')).status, 409);
    assert.equal((await req('/payments/' + p.id, other)).status, 404);
    assert.equal((await req('/appointments/' + first.id + '/payments', other)).status, 404);
    const summary = await json(await req('/appointments/' + first.id, owner));
    assert.equal(summary.paymentStatus, 'pending'); assert.equal(summary.canCancel, false); assert.ok(summary.slot.id);
    const forged = await req('/payments/sslcommerz/success', '', { tran_id: p.merchantTransactionId, val_id: 'forged' });
    assert.equal(forged.status, 400); assert.equal((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status, 'PENDING');
    const good = await ipn(p.id);
    assert.equal(good.response.status, 200);
    assert.deepEqual(await good.response.json(), { acknowledged: true });
    const repeat = await req('/payments/sslcommerz/ipn', '', { tran_id: p.merchantTransactionId, val_id: good.val });
    assert.equal(repeat.status, 200);
    const paid = await json(await req('/payments/' + p.id, owner));
    assert.equal(paid.status, 'paid'); assert.equal(paid.applied, true); assert.equal(paid.checkoutUrl, null);
    assert.ok(!JSON.stringify(paid).includes('session-'));
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: first.id } })).status, 'PENDING');
    assert.equal((await req('/appointments/' + first.id + '/pay', owner, contact)).status, 409);
    assert.equal((await req('/appointments/' + first.id + '/cancel', owner, {}, 'PATCH')).status, 409);
    query.set(p.id, [{ status: 'FAILED', tran_id: p.merchantTransactionId, sessionkey: p.sessionKey! }]);
    await unlock(p.id);
    const outOfOrder = await req('/payments/sslcommerz/fail', '', { tran_id: p.merchantTransactionId, status: 'FAILED' });
    assert.equal(outOfOrder.status, 200); assert.match(outOfOrder.headers.get('content-type')!, /text\/html/);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status, 'PAID');
    await db.service.update({ where: { id: serviceId }, data: { name: 'Edited wash', price: 5000 } });
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: first.id } })).price.toNumber(), 1400);

    // Validation mismatches become incidents and cannot be applied or auto-cleared.
    for (const patch of [{ amount: '1400.01' }, { currency: 'USD' }, { sessionkey: 'wrong' }, { risk_level: '1' }]) {
      const row = await appointment(), attempt = await pay(row.id);
      assert.equal((await ipn(attempt.paymentId, patch)).response.status, 200);
      const saved = await db.payment.findUniqueOrThrow({ where: { id: attempt.paymentId } });
      assert.equal(saved.status, 'REVIEW_REQUIRED'); assert.equal(saved.applied, false);
      assert.equal((await req('/admin/appointments/' + row.id + '/status', admin, { status: 'confirmed' }, 'PATCH')).status, 409);
      assert.equal((await req('/appointments/' + row.id + '/cancel', owner, {}, 'PATCH')).status, 409);
    }
    const wrongTranRow = await appointment(), wrongTran = await pay(wrongTranRow.id);
    assert.equal((await ipn(wrongTran.paymentId, { tran_id: 'forged' })).response.status, 400);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: wrongTran.paymentId } })).status, 'PENDING');

    // Network failure after request delivery cannot create another checkout.
    shouldTimeout = true;
    const uncertainRow = await appointment();
    assert.equal((await req('/appointments/' + uncertainRow.id + '/pay', owner, contact)).status, 503);
    shouldTimeout = false;
    const uncertain = (await db.payment.findMany({ where: { appointmentId: uncertainRow.id } }))[0];
    assert.equal(uncertain.status, 'REVIEW_REQUIRED');
    assert.equal((await req('/appointments/' + uncertainRow.id + '/pay', owner, contact)).status, 409);
    const recovered = await paidOrder(uncertain.id);
    query.set(uncertain.id, [recovered.v]);
    assert.equal((await json(await req('/payments/' + uncertain.id + '/reconcile', owner, {}))).status, 'paid');
    assert.equal((await req('/payments/' + uncertain.id + '/reconcile', owner, {})).status, 429);

    // Terminal session query enables retry; callbacks alone cannot release it.
    for (const terminal of ['FAILED', 'CANCELLED', 'EXPIRED']) {
      const row = await appointment(), attempt = await pay(row.id);
      const saved = await db.payment.findUniqueOrThrow({ where: { id: attempt.paymentId } });
      query.set(saved.id, [{ status: 'PENDING', tran_id: saved.merchantTransactionId, sessionkey: saved.sessionKey! }]);
      await json(await req('/payments/sslcommerz/ipn', '', { tran_id: saved.merchantTransactionId, status: terminal }));
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: saved.id } })).status, 'PENDING');
      query.set(saved.id, [{ status: terminal, tran_id: saved.merchantTransactionId, sessionkey: saved.sessionKey! }]); await unlock(saved.id);
      assert.equal((await json(await req('/payments/' + saved.id + '/reconcile', owner, {}))).status, terminal.toLowerCase());
      const retry = await pay(row.id); assert.notEqual(retry.paymentId, saved.id);
      // A late verified charge is retained; the second successful charge requires review.
      assert.equal((await ipn(saved.id)).response.status, 200);
      assert.equal((await ipn(retry.paymentId)).response.status, 200);
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: retry.paymentId } })).status, 'REVIEW_REQUIRED');
      assert.equal(await db.payment.count({ where: { appointmentId: row.id, applied: true } }), 1);
    }

    // Safe terminal cancellation followed by a late success must not reopen the booking.
    const lateRow = await appointment(), late = await pay(lateRow.id);
    const lateP = await db.payment.findUniqueOrThrow({ where: { id: late.paymentId } });
    query.set(lateP.id, [{ status: 'FAILED', tran_id: lateP.merchantTransactionId, sessionkey: lateP.sessionKey! }]);
    await json(await req('/payments/' + lateP.id + '/reconcile', owner, {}));
    assert.equal((await req('/appointments/' + lateRow.id + '/cancel', owner, {}, 'PATCH')).status, 200);
    assert.equal((await ipn(lateP.id)).response.status, 200);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: lateP.id } })).status, 'REVIEW_REQUIRED');
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: lateRow.id } })).status, 'CANCELLED');

    // Hold only the external request: cancellation and a duplicate request see INITIATING.
    const race = await appointment();
    gate = new Promise<void>((resolve) => { release = resolve; });
    const running = req('/appointments/' + race.id + '/pay', owner, contact);
    for (let i = 0; i < 100; i++) { if (await db.payment.count({ where: { appointmentId: race.id } })) break; await new Promise((r) => setTimeout(r, 5)); }
    assert.equal((await req('/appointments/' + race.id + '/cancel', owner, {}, 'PATCH')).status, 409);
    release!(); gate = undefined;
    await json(await running);
    assert.equal(await db.payment.count({ where: { appointmentId: race.id } }), 1);

    // A second charge on the same merchant attempt remains a recorded incident.
    assert.equal((await ipn(p.id)).response.status, 200);
    const duplicateCharge = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(duplicateCharge.status, 'REVIEW_REQUIRED'); assert.equal(duplicateCharge.applied, true);
    assert.ok(Array.isArray(duplicateCharge.gatewayIncidents) && duplicateCharge.gatewayIncidents.length > 0);

    const adminRows = await json(await req('/admin/payments?status=review_required', admin));
    assert.ok(adminRows.length > 0); assert.ok(adminRows[0].customer.email); assert.ok(adminRows[0].merchantTransactionId);
    assert.ok(!JSON.stringify(adminRows).includes('test-secret'));
    assert.equal((await json(await req('/admin/appointments/' + first.id, admin))).paymentStatus, 'review_required');
    await unlock(p.id);
    assert.equal((await req('/admin/payments/' + p.id + '/reconcile', owner, {})).status, 403);
    assert.equal((await json(await req('/admin/payments/' + p.id + '/reconcile', admin, {}))).status, 'review_required');
    assert.equal((await req('/admin/payments?from=bad', admin)).status, 400);
    assert.equal((await req('/payments/' + p.id + '/reconcile', other, {})).status, 404);
    // Invariant persists even for code outside the HTTP layer.
    await assert.rejects(() => db.payment.create({ data: { appointmentId: first.id, amount: 1400, currency: 'BDT', merchantTransactionId: 'DB' + randomBytes(14).toString('hex'), status: 'PAID', applied: true, paidAt: new Date(), validationId: randomUUID(), bankTransactionId: randomUUID() } }));
    await assert.rejects(() => db.payment.update({ where: { id: p.id }, data: { amount: 1401 } }));
    for (let i = 0; i < 31; i++) {
      await unlock(p.id);
      const response = await req('/payments/' + p.id + '/reconcile', owner, {});
      if (i === 30) assert.equal((await json(response, 429)).code, 'PAYMENT_RATE_LIMITED');
    }
  } finally {
    release?.();
    await db.payment.deleteMany({ where: { appointmentId: { in: appointments } } });
    await db.appointment.deleteMany({ where: { id: { in: appointments } } });
    if (serviceId) { await db.appointmentSlot.deleteMany({ where: { serviceId } }); await db.service.deleteMany({ where: { id: serviceId } }); }
    if (bayId) await db.serviceBay.deleteMany({ where: { id: bayId } });
    if (categoryId) await db.serviceCategory.deleteMany({ where: { id: categoryId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  }
});

test('missing integrations leave booking, workshop payment, cancellation and legacy images working', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('hex');
  delete process.env.SSLCOMMERZ_STORE_ID; delete process.env.SSLCOMMERZ_STORE_PASSWORD;
  delete process.env.CLOUDINARY_CLOUD_NAME; delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: false });
  configureApp(app); await app.listen(0, '127.0.0.1');
  const db = app.get(PrismaService), base = (await app.getUrl()) + '/api/v1';
  let userId = '', appointmentId = '', imageId = '';
  try {
    const config = await (await fetch(base + '/payments/config')).json() as any;
    assert.equal(config.onlinePaymentEnabled, false); assert.equal(config.payAtWorkshopEnabled, true);
    const registered = await (await fetch(base + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Workshop customer', email: 'disabled-' + randomBytes(6).toString('hex') + '@example.com', password: 'long-test-password' }) })).json() as any;
    userId = registered.user.id;
    const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + registered.accessToken };
    const services = await (await fetch(base + '/services')).json() as any[];
    const platform = await (await fetch(base + '/platform')).json() as any;
    assert.equal(platform.booking.horizonDays, 30); assert.equal(platform.booking.timeZone, 'Asia/Dhaka');
    const tomorrow = new Date(Date.now() + 86400000 + 21600000).toISOString().slice(0, 10);
    const availability = await (await fetch(base + '/services/' + services[0].id + '/availability?date=' + tomorrow)).json() as any;
    const slot = availability.slots.find((s: any) => s.available);
    assert.ok(slot);
    const bookedResponse = await fetch(base + '/appointments', { method: 'POST', headers, body: JSON.stringify({ serviceId: services[0].id, slotId: slot.id }) });
    assert.equal(bookedResponse.status, 201);
    const booked = await bookedResponse.json() as any; appointmentId = booked.id;
    assert.equal(booked.status, 'pending'); assert.equal(booked.paymentStatus, 'unpaid'); assert.equal(booked.canPayOnline, false); assert.equal(booked.canCancel, true);
    assert.equal((await fetch(base + '/appointments/' + booked.id + '/pay', { method: 'POST', headers, body: JSON.stringify({ phone: '01700000000', address: 'Dhaka', city: 'Dhaka', postcode: '1200' }) })).status, 503);
    assert.equal((await fetch(base + '/appointments/' + booked.id + '/cancel', { method: 'PATCH', headers, body: '{}' })).status, 200);
    assert.equal(await db.payment.count({ where: { appointmentId } }), 0);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64');
    imageId = (await db.mediaAsset.create({ data: { data: png, mimeType: 'image/png', fileSize: png.length } })).id;
    assert.deepEqual(Buffer.from(await (await fetch(base + '/media/images/' + imageId)).arrayBuffer()), png);
    await assert.rejects(() => db.mediaAsset.create({ data: { storageProvider: 'CLOUDINARY', mimeType: 'image/png', fileSize: 50, cloudinaryPublicId: randomUUID() } }));
    await db.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
    const upload = await fetch(base + '/admin/media/images', { method: 'POST', headers: { authorization: headers.authorization }, body: form });
    assert.equal(upload.status, 503); assert.equal((await upload.json() as any).code, 'MEDIA_DISABLED');
  } finally {
    if (appointmentId) await db.appointment.deleteMany({ where: { id: appointmentId } });
    if (imageId) await db.mediaAsset.deleteMany({ where: { id: imageId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await app.close();
  }
});
