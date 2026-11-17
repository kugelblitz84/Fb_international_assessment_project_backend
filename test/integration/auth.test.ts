import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/bootstrap';
import { PrismaService } from '../../src/core/database/prisma.service';

test(
  'authentication lifecycle, browser CSRF and concurrent rotation',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ACCESS_TOKEN_SECRET =
      randomBytes(48).toString('base64url');
    process.env.CORS_ORIGINS = 'http://localhost:5173';
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const db = app.get(PrismaService);
    const email = `test-${randomBytes(8).toString('hex')}@example.invalid`;
    let userId: string | undefined;
    const request = async (
      path: string,
      body?: unknown,
      cookie?: string,
      extra: Record<string, string> = {},
    ) =>
      fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const read = async (response: Response): Promise<Record<string, unknown>> =>
      response.json() as Promise<Record<string, unknown>>;
    const cookie = (response: Response) =>
      response.headers.get('set-cookie')!.split(';')[0];
    try {
      const registered = await request('/auth/register', {
        name: 'Customer',
        email: email.toUpperCase(),
        password: 'long-test-password',
      });
      assert.equal(registered.status, 201);
      const payload = await read(registered);
      const user = payload.user as { id: string; email: string };
      userId = user.id;
      assert.equal(user.email, email);
      assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name']);
      const firstCookie = cookie(registered);
      assert.match(registered.headers.get('set-cookie')!, /HttpOnly/);
      assert.doesNotMatch(registered.headers.get('set-cookie')!, /; Secure/);
      const session = await db.authSession.findFirstOrThrow({
        where: { userId },
        include: { refreshTokens: true },
      });
      assert.equal(session.refreshTokens.length, 1);
      assert.equal(session.refreshTokenDigest, session.refreshTokens[0].digest);
      assert.equal(session.refreshTokenDigest.length, 64);
      assert.ok(!JSON.stringify(session).includes(firstCookie.split('=')[1]));
      assert.equal(
        (
          await request('/auth/register', {
            name: 'Customer',
            email,
            password: 'long-test-password',
          })
        ).status,
        409,
      );
      assert.equal(
        (await request('/auth/login', { email, password: 'wrong' })).status,
        401,
      );
      const login = await request('/auth/login', {
        email,
        password: 'long-test-password',
      });
      assert.equal(login.status, 200);
      const deviceCookie = cookie(login);
      assert.equal(await db.authSession.count({ where: { userId } }), 2);
      const token = payload.accessToken as string;
      assert.equal(
        (
          await request('/auth/me', undefined, undefined, {
            authorization: `Bearer ${token}`,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request('/auth/refresh', {}, firstCookie, {
            origin: 'https://untrusted.invalid',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request('/auth/refresh', {}, firstCookie, {
            origin: 'http://localhost:5173',
          })
        ).status,
        403,
      );
      const csrf = await request('/auth/csrf', undefined, firstCookie, {
        origin: 'http://localhost:5173',
      });
      const csrfToken = (await read(csrf)).csrfToken as string;
      const rotated = await request('/auth/refresh', {}, firstCookie, {
        origin: 'http://localhost:5173',
        'x-csrf-token': csrfToken,
      });
      assert.equal(rotated.status, 200);
      const nextCookie = cookie(rotated);
      const history = await db.authRefreshToken.findMany({
        where: { sessionId: session.id },
      });
      assert.equal(history.length, 2);
      assert.equal(history.filter((t) => t.usedAt).length, 1);
      const changed = await db.authSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      assert.notEqual(changed.refreshTokenDigest, session.refreshTokenDigest);
      assert.equal(changed.expiresAt.getTime(), session.expiresAt.getTime());
      // Unknown digest with a known UUID must not revoke.
      assert.equal(
        (
          await request(
            '/auth/refresh',
            {},
            `refresh_token=${session.id}.${randomBytes(32).toString('base64url')}`,
          )
        ).status,
        401,
      );
      assert.equal(
        (await db.authSession.findUniqueOrThrow({ where: { id: session.id } }))
          .revokedAt,
        null,
      );
      assert.equal(
        (await request('/auth/refresh', {}, firstCookie)).status,
        401,
      );
      assert.ok(
        (await db.authSession.findUniqueOrThrow({ where: { id: session.id } }))
          .revokedAt,
      );
      assert.equal(
        (
          await request('/auth/me', undefined, undefined, {
            authorization: `Bearer ${token}`,
          })
        ).status,
        401,
      );
      assert.equal(
        (await request('/auth/refresh', {}, nextCookie)).status,
        401,
      );
      const race = await Promise.all([
        request('/auth/refresh', {}, deviceCookie),
        request('/auth/refresh', {}, deviceCookie),
      ]);
      assert.deepEqual(race.map((r) => r.status).sort(), [200, 401]);
      const third = await request('/auth/login', {
        email,
        password: 'long-test-password',
      });
      const thirdCookie = cookie(third);
      const thirdToken = (await read(third)).accessToken as string;
      const logout = await request('/auth/logout', {}, thirdCookie, {
        authorization: 'Bearer expired-token',
      });
      assert.equal(logout.status, 204);
      assert.match(
        logout.headers.get('set-cookie')!,
        /Expires=Thu, 01 Jan 1970/,
      );
      assert.equal(
        (
          await request('/auth/me', undefined, undefined, {
            authorization: `Bearer ${thirdToken}`,
          })
        ).status,
        401,
      );
      const fourth = await request('/auth/login', {
        email,
        password: 'long-test-password',
      });
      const fourthCookie = cookie(fourth);
      const fourthToken = (await read(fourth)).accessToken as string;
      await request('/auth/logout', {}, thirdCookie);
      assert.equal(
        (
          await request('/auth/me', undefined, undefined, {
            authorization: `Bearer ${fourthToken}`,
          })
        ).status,
        200,
      );
      const profile = await fetch(base + '/users/me', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${fourthToken}`,
        },
        body: JSON.stringify({ name: 'Updated Customer' }),
      });
      assert.equal(profile.status, 200);
      assert.equal(
        ((await read(profile)).user as { name: string }).name,
        'Updated Customer',
      );
      await db.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        (await request('/auth/refresh', {}, fourthCookie)).status,
        401,
      );
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  },
);
