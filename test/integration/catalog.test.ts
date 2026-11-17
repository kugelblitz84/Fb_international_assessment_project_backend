import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/bootstrap';
import { PrismaService } from '../../src/core/database/prisma.service';
import { seed } from '../../prisma/seed';
import type {
  ServiceDto,
  OfferDto,
} from '../../src/features/catalog/domain/catalog.types';

test(
  'seed idempotence and public catalog HTTP contracts',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ACCESS_TOKEN_SECRET =
      randomBytes(48).toString('base64url');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const db = app.get(PrismaService);
    try {
      await seed(db);
      const before = {
        services: await db.service.count(),
        categories: await db.serviceCategory.count(),
        items: await db.packageItem.count(),
        hours: await db.businessHours.count(),
        bays: await db.serviceBay.count(),
        offers: await db.offer.findMany({ orderBy: { id: 'asc' } }),
      };
      await seed(db);
      assert.equal(await db.service.count(), before.services);
      assert.equal(await db.serviceCategory.count(), before.categories);
      assert.equal(await db.packageItem.count(), before.items);
      assert.equal(await db.businessHours.count(), before.hours);
      assert.equal(await db.serviceBay.count(), before.bays);
      assert.deepEqual(
        await db.offer.findMany({ orderBy: { id: 'asc' } }),
        before.offers,
      );
      const all = (await (
        await fetch(base + '/services')
      ).json()) as ServiceDto[];
      assert.equal(all.length, 9);
      const packages = (await (
        await fetch(base + '/services?type=PACKAGE')
      ).json()) as ServiceDto[];
      assert.equal(packages.length, 3);
      assert.ok(packages.every((p) => p.packageItems.length === 3));
      const premium = packages.find((p) => p.slug === 'premium-car-care')!;
      assert.equal(premium.price, 3300);
      assert.equal(premium.originalPrice, 3500);
      const detail = (await (
        await fetch(base + `/services/${premium.id}`)
      ).json()) as ServiceDto;
      assert.deepEqual(detail, premium);
      const search = (await (
        await fetch(base + '/services?search=exterior&maxPrice=700')
      ).json()) as ServiceDto[];
      assert.equal(search.length, 1);
      assert.equal(search[0].slug, 'exterior-wash');
      assert.equal(
        (await fetch(base + '/services?featured=invalid')).status,
        400,
      );
      const offers = (await (
        await fetch(base + '/offers')
      ).json()) as OfferDto[];
      assert.equal(offers.length, 2);
      const category = await db.serviceCategory.findUniqueOrThrow({
        where: { slug: 'inspection' },
      });
      await db.serviceCategory.update({
        where: { id: category.id },
        data: { isActive: false },
      });
      try {
        const visible = (await (
          await fetch(base + '/services')
        ).json()) as ServiceDto[];
        assert.ok(!visible.some((s) => s.categoryId === category.id));
        assert.ok(!visible.some((s) => s.type === 'PACKAGE'));
      } finally {
        await db.serviceCategory.update({
          where: { id: category.id },
          data: { isActive: true },
        });
      }
    } finally {
      await app.close();
    }
  },
);
