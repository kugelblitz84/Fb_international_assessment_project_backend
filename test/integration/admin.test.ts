import { spawnSync } from 'node:child_process';
import { loadAppConfig } from '../../src/core/config/app-config';
import { seed } from '../../prisma/seed';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/bootstrap';
import { PrismaService } from '../../src/core/database/prisma.service';
import { workshopDate } from '../../src/features/scheduling/domain/workshop-time';
import { AvailabilityService } from '../../src/features/scheduling/application/availability.service';
import { CloudinaryService } from '../../src/features/media/cloudinary.service';

test(
  'admin authorization, catalog, packages, offers, media and atomic appointment transitions',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('hex');
    process.env.PUBLIC_API_BASE_URL = 'https://api.example.invalid/api/v1';
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    app.get(CloudinaryService).upload = async (_data, id) => ({ publicId: 'autocare/' + id, secureUrl: 'https://res.cloudinary.com/test/image/upload/' + id + '.png' });
    await app.listen(0, '127.0.0.1');
    const db = app.get(PrismaService),
      base = (await app.getUrl()) + '/api/v1';
    let token = '';
    const ids = {
      user: '',
      category: '',
      service: '',
      pack: '',
      offer: '',
      media: '',
      bay: '',
    };
    const req = (path: string, body?: unknown, method?: string, auth = token) =>
      fetch(base + path, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: {
          'content-type': 'application/json',
          ...(auth ? { authorization: 'Bearer ' + auth } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async (response: Response, status = 200) => {
      assert.equal(response.status, status, await response.clone().text());
      return response.json() as Promise<any>;
    };
    try {
      await seed(db);
      assert.equal((await req('/admin/dashboard')).status, 401);
      const credentials = {
        name: 'Admin test',
        email: `admin-${randomUUID()}@example.invalid`,
        password: 'long-test-password',
      };
      assert.equal(
        (await req('/auth/register', { ...credentials, role: 'ADMIN' })).status,
        400,
      );
      const registered = await json(
        await req('/auth/register', credentials),
        201,
      );
      ids.user = registered.user.id;
      token = registered.accessToken;
      assert.equal(registered.user.role, 'CUSTOMER');
      assert.equal((await req('/admin/dashboard')).status, 403);
      assert.equal(
        (await req('/users/me', { role: 'ADMIN' }, 'PATCH')).status,
        400,
      );
      await db.user.update({
        where: { id: ids.user },
        data: { role: 'ADMIN' },
      });
      assert.equal((await req('/admin/dashboard')).status, 200);
      assert.equal((await json(await req('/auth/me'))).user.role, 'ADMIN');
      await db.user.update({
        where: { id: ids.user },
        data: { role: 'CUSTOMER' },
      });
      assert.equal((await req('/admin/categories')).status, 403);
      await db.user.update({
        where: { id: ids.user },
        data: { role: 'ADMIN', status: 'SUSPENDED' },
      });
      assert.equal((await req('/admin/dashboard')).status, 401);
      await db.user.update({
        where: { id: ids.user },
        data: { status: 'ACTIVE' },
      });
      ids.category = (
        await json(
          await req('/admin/categories', {
            name: 'Test ' + randomUUID(),
            isActive: false,
          }),
          201,
        )
      ).id;
      assert.equal(
        (await json(await req('/admin/categories'))).some(
          (c: any) => c.id === ids.category,
        ),
        true,
      );
      assert.equal(
        (await json(await req('/categories'))).some(
          (c: any) => c.id === ids.category,
        ),
        false,
      );
      await json(
        await req(
          '/admin/categories/' + ids.category,
          { isActive: true },
          'PATCH',
        ),
      );
      const service = {
        categoryId: ids.category,
        type: 'INDIVIDUAL',
        name: 'Test ' + randomUUID(),
        description: 'Test service',
        price: '100.25',
        durationMinutes: 45,
        inclusions: ['Wash'],
      };
      assert.equal(
        (await req('/admin/services', { ...service, categoryId: randomUUID() }))
          .status,
        400,
      );
      assert.equal(
        (await req('/admin/services', { ...service, price: '1.001' })).status,
        400,
      );
      ids.service = (await json(await req('/admin/services', service), 201)).id;
      assert.equal((await req('/admin/services', { ...service })).status, 409);
      const pack = {
        ...service,
        type: 'PACKAGE',
        name: 'Package ' + randomUUID(),
        packageItems: [{ serviceId: ids.service, quantity: 1 }],
      };
      assert.equal(
        (await req('/admin/services', { ...pack, packageItems: [] })).status,
        400,
      );
      assert.equal(
        (
          await req('/admin/services', {
            ...pack,
            packageItems: [...pack.packageItems, ...pack.packageItems],
          })
        ).status,
        400,
      );
      ids.pack = (await json(await req('/admin/services', pack), 201)).id;
      assert.equal(
        (
          await req(
            '/admin/services/' + ids.pack,
            { packageItems: [{ serviceId: ids.pack, quantity: 1 }] },
            'PATCH',
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/admin/services', {
            ...pack,
            name: 'Nested',
            packageItems: [{ serviceId: ids.pack, quantity: 1 }],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            '/admin/services/' + ids.service,
            { type: 'PACKAGE', packageItems: pack.packageItems },
            'PATCH',
          )
        ).status,
        409,
      );
      await json(
        await req(
          '/admin/services/' + ids.pack,
          { packageItems: [{ serviceId: ids.service, quantity: 2 }] },
          'PATCH',
        ),
      );
      const offer = {
        serviceId: ids.service,
        title: 'Offer',
        description: 'Discount',
        discountType: 'PERCENTAGE',
        discountValue: '10',
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      };
      for (const invalid of [
        { discountValue: 101 },
        { discountValue: 0 },
        { endsAt: offer.startsAt },
        { serviceId: randomUUID() },
      ])
        assert.equal(
          (await req('/admin/offers', { ...offer, ...invalid })).status,
          400,
        );
      ids.offer = (await json(await req('/admin/offers', offer), 201)).id;
      assert.equal(
        (
          await req(
            '/admin/offers/' + ids.offer,
            { discountValue: 101 },
            'PATCH',
          )
        ).status,
        400,
      );
      assert.equal(
        (await json(await req('/services/' + ids.service))).price,
        90.23,
      );
      await json(
        await req(
          '/admin/categories/' + ids.category,
          { isActive: false },
          'PATCH',
        ),
      );
      assert.equal((await req('/services/' + ids.service)).status, 404);
      assert.equal((await req('/admin/services/' + ids.service)).status, 200);
      await json(
        await req(
          '/admin/categories/' + ids.category,
          { isActive: true },
          'PATCH',
        ),
      );
      const upload = (data: Uint8Array, mime: string, auth = token) => {
        const form = new FormData();
        form.append(
          'file',
          new Blob([data as BlobPart], { type: mime }),
          'test',
        );
        return fetch(base + '/admin/media/images', {
          method: 'POST',
          headers: auth ? { authorization: 'Bearer ' + auth } : {},
          body: form,
        });
      };
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=',
        'base64',
      );
      assert.equal((await upload(png, 'image/png', '')).status, 401);
      await db.user.update({
        where: { id: ids.user },
        data: { role: 'CUSTOMER' },
      });
      assert.equal((await upload(png, 'image/png')).status, 403);
      await db.user.update({
        where: { id: ids.user },
        data: { role: 'ADMIN' },
      });
      assert.equal(
        (await upload(Buffer.from('<svg/>'), 'image/png')).status,
        400,
      );
      assert.equal(
        (await upload(Buffer.alloc(2097153), 'image/png')).status,
        413,
      );
      const media = await json(
        await upload(png, 'application/octet-stream'),
        201,
      );
      ids.media = media.id;
      assert.equal(
        media.imageUrl,
        'https://res.cloudinary.com/test/image/upload/' + ids.media + '.png',
      );
      assert.deepEqual(Object.keys(media).sort(), ['id', 'imageUrl']);
      const stored = await db.mediaAsset.findUniqueOrThrow({ where: { id: ids.media } });
      assert.equal(stored.data, null);
      assert.equal(stored.storageProvider, 'CLOUDINARY');
      // Existing bytea images remain readable independently of new cloud uploads.
      await db.mediaAsset.update({ where: { id: ids.media }, data: { storageProvider: 'POSTGRESQL', data: png, cloudinaryPublicId: null, cloudinarySecureUrl: null } });
      const image = await req(
        '/media/images/' + ids.media,
        undefined,
        undefined,
        '',
      );
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('content-type'), 'image/png');
      assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
      assert.equal((await req('/media/images/' + randomUUID())).status, 404);
      ids.bay = (
        await db.serviceBay.create({ data: { name: 'Test ' + randomUUID() } })
      ).id;
      const availability = app.get(AvailabilityService),
        date = workshopDate(new Date(Date.now() + 86400000));
      const slots = await availability.getAvailability(ids.service, date);
      assert.ok(slots.slots.length);
      const slot = slots.slots.find((s) => s.available)!;
      await json(
        await req(
          '/admin/services/' + ids.service,
          { durationMinutes: 60 },
          'PATCH',
        ),
      );
      const changed = await availability.getAvailability(ids.service, date);
      assert.ok(changed.slots.length);
      assert.ok(
        changed.slots.every(
          (s) =>
            new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime() ===
            3600000,
        ),
      );
      const booking = await json(
        await req('/appointments', { serviceId: ids.service, slotId: slot.id }),
        201,
      );
      const ap = booking.id;
      const transitions = await Promise.all([
        req(
          '/admin/appointments/' + ap + '/status',
          { status: 'confirmed' },
          'PATCH',
        ),
        req(
          '/admin/appointments/' + ap + '/status',
          { status: 'cancelled' },
          'PATCH',
        ),
      ]);
      assert.ok(transitions.some((r) => r.status === 200));
      assert.ok(transitions.every((r) => [200, 409].includes(r.status)));
      const current = await json(await req('/admin/appointments/' + ap));
      assert.equal(current.user.email, credentials.email);
      assert.equal('passwordHash' in current.user, false);
      if (current.status === 'confirmed') {
        assert.equal(
          (
            await req(
              '/admin/appointments/' + ap + '/status',
              { status: 'completed' },
              'PATCH',
            )
          ).status,
          409,
        );
        await json(
          await req(
            '/admin/appointments/' + ap + '/status',
            { status: 'cancelled' },
            'PATCH',
          ),
        );
      }
      assert.equal(
        (
          await req(
            '/admin/appointments/' + ap + '/status',
            { status: 'confirmed' },
            'PATCH',
          )
        ).status,
        409,
      );
      const pastSlot = await db.appointmentSlot.create({
        data: {
          serviceId: ids.service,
          bayId: ids.bay,
          startsAt: new Date(Date.now() - 7200000),
          endsAt: new Date(Date.now() - 3600000),
        },
      });
      const completed = await db.appointment.create({
        data: {
          userId: ids.user,
          serviceId: ids.service,
          bayId: ids.bay,
          slotId: pastSlot.id,
          status: 'CONFIRMED',
          startsAt: pastSlot.startsAt,
          endsAt: pastSlot.endsAt,
          serviceName: 'Historical',
          basePrice: 100,
          price: 100,
          currency: 'BDT',
          durationMinutes: 60,
        },
      });
      const race = await Promise.all([
        req(
          '/admin/appointments/' + completed.id + '/status',
          { status: 'completed' },
          'PATCH',
        ),
        req(
          '/admin/appointments/' + completed.id + '/status',
          { status: 'cancelled' },
          'PATCH',
        ),
      ]);
      assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
      await json(
        await req(
          '/admin/services/' + ids.service,
          { name: 'Renamed', price: 200 },
          'PATCH',
        ),
      );
      assert.equal(
        (
          await db.appointment.findUniqueOrThrow({
            where: { id: completed.id },
          })
        ).serviceName,
        'Historical',
      );
      assert.equal((await req('/admin/appointments?status=bad')).status, 400);
      const pendingPast = await db.appointment.create({
        data: {
          userId: ids.user,
          serviceId: ids.service,
          bayId: ids.bay,
          slotId: pastSlot.id,
          startsAt: pastSlot.startsAt,
          endsAt: pastSlot.endsAt,
          serviceName: 'Historical',
          basePrice: 100,
          price: 100,
          currency: 'BDT',
          durationMinutes: 60,
        },
      });
      await json(
        await req(
          '/admin/appointments/' + pendingPast.id + '/status',
          { status: 'confirmed' },
          'PATCH',
        ),
      );
      const done = await json(
        await req(
          '/admin/appointments/' + pendingPast.id + '/status',
          { status: 'completed' },
          'PATCH',
        ),
      );
      assert.equal(done.status, 'completed');
      assert.equal(
        (
          await req(
            '/admin/appointments/' + pendingPast.id + '/status',
            { status: 'cancelled' },
            'PATCH',
          )
        ).status,
        409,
      );
      const filtered = await json(
        await req(
          '/admin/appointments?status=completed&date=' +
            workshopDate(pastSlot.startsAt),
        ),
      );
      assert.ok(filtered.some((row: any) => row.id === pendingPast.id));
      await db.authSession.updateMany({
        where: { userId: ids.user },
        data: { revokedAt: new Date() },
      });
      assert.equal((await req('/admin/dashboard')).status, 401);
    } finally {
      if (ids.user)
        await db.appointment.deleteMany({ where: { userId: ids.user } });
      const serviceIds = [ids.service, ids.pack].filter(Boolean);
      await db.appointmentSlot.deleteMany({
        where: { serviceId: { in: serviceIds } },
      });
      if (ids.offer) await db.offer.deleteMany({ where: { id: ids.offer } });
      await db.packageItem.deleteMany({
        where: { packageId: { in: serviceIds } },
      });
      await db.service.deleteMany({ where: { id: { in: serviceIds } } });
      if (ids.category)
        await db.serviceCategory.deleteMany({ where: { id: ids.category } });
      if (ids.bay) await db.serviceBay.deleteMany({ where: { id: ids.bay } });
      if (ids.media)
        await db.mediaAsset.deleteMany({ where: { id: ids.media } });
      if (ids.user) await db.user.deleteMany({ where: { id: ids.user } });
      await app.close();
    }
  },
);

test(
  'administrator CLI provisions without promoting existing accounts or leaking credentials',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('hex');
    const db = new PrismaService(loadAppConfig());
    const email = 'cli-' + randomUUID() + '@example.invalid',
      password = randomBytes(20).toString('hex');
    const env = {
      ...process.env,
      ADMIN_NAME: 'CLI admin',
      ADMIN_EMAIL: email.toUpperCase(),
      ADMIN_PASSWORD: password,
    };
    const run = () =>
      spawnSync(
        process.execPath,
        ['--require', 'ts-node/register', 'scripts/create-admin.ts'],
        { env, encoding: 'utf8', timeout: 30000 },
      );
    try {
      const first = run();
      assert.equal(first.status, 0, first.stderr);
      assert.ok(first.stdout.includes('Administrator created successfully'));
      assert.ok(!first.stdout.includes(password));
      const admin = await db.user.findUniqueOrThrow({ where: { email } });
      assert.equal(admin.role, 'ADMIN');
      assert.equal(admin.status, 'ACTIVE');
      await db.user.update({
        where: { id: admin.id },
        data: { role: 'CUSTOMER' },
      });
      const duplicate = run();
      assert.equal(duplicate.status, 1);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { email } })).role,
        'CUSTOMER',
      );
      assert.ok(!duplicate.stderr.includes(password));
    } finally {
      await db.user.deleteMany({ where: { email } });
      await db.$disconnect();
    }
  },
);
