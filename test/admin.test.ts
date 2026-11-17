import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register, update } from '../src/features/auth/registration.schemas';
import {
  categoryCreate,
  serviceCreate,
  offerCreate,
  money,
  appointmentFilters,
} from '../src/features/admin/domain/admin.schemas';
import {
  imageMime,
  MAX_IMAGE_BYTES,
} from '../src/features/media/image-signature';
import { RolesGuard } from '../src/core/auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { Roles } from '../src/core/auth/decorators/roles.decorator';
test('strict registration and profile schemas reject role escalation', () => {
  const input = {
    name: 'Customer',
    email: ' CUSTOMER@example.invalid ',
    password: 'long-password',
  };
  assert.equal(register.parse(input).email, 'customer@example.invalid');
  assert.equal(register.safeParse({ ...input, role: 'ADMIN' }).success, false);
  assert.equal(update.safeParse({ role: 'ADMIN' }).success, false);
});
test('admin validation enforces UUID, monetary precision, timestamps and strict fields', () => {
  for (const value of ['-1', '1.001', '10000000000', '1e3', NaN, Infinity])
    assert.equal(money.safeParse(value).success, false);
  assert.equal(money.parse('9999999999.99'), '9999999999.99');
  assert.equal(
    categoryCreate.safeParse({ name: 'Test', unknown: true }).success,
    false,
  );
  assert.equal(serviceCreate.safeParse({ categoryId: 'bad' }).success, false);
  assert.equal(offerCreate.safeParse({ startsAt: 'yesterday' }).success, false);
  assert.equal(
    appointmentFilters.safeParse({ date: '2026-02-30' }).success,
    false,
  );
});
test('role guard distinguishes missing identity, customers and administrators', () => {
  @Roles('ADMIN')
  class Admin {}
  const guard = new RolesGuard(new Reflector());
  const context = (user: unknown) =>
    ({
      getHandler: () => function handler() {},
      getClass: () => Admin,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;
  assert.throws(() => guard.canActivate(context(undefined)), { status: 401 });
  assert.throws(() => guard.canActivate(context({ role: 'CUSTOMER' })), {
    status: 403,
  });
  assert.equal(guard.canActivate(context({ role: 'ADMIN' })), true);
});
test('image signatures reject spoofed formats and oversized content', () => {
  for (const bytes of [
    Buffer.from('<svg/>'),
    Buffer.from('MZ executable'),
    Buffer.from('not a jpeg'),
    Buffer.alloc(0),
  ])
    assert.throws(() => imageMime(bytes), { status: 400 });
  assert.throws(() => imageMime(Buffer.alloc(MAX_IMAGE_BYTES + 1)), {
    status: 413,
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=',
    'base64',
  );
  assert.equal(imageMime(png), 'image/png');
});
