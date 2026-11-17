import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/bootstrap';
import { AssistantModel } from '../../src/features/assistant/domain/assistant.types';
import { AssistantContextService } from '../../src/features/assistant/application/assistant-context.service';
import { PrismaService } from '../../src/core/database/prisma.service';
import { SessionService } from '../../src/core/auth/services/session.service';
import { seed } from '../../prisma/seed';
import { AssistantBudgetRepository } from '../../src/features/assistant/data/assistant-budget.repository';
test(
  'assistant HTTP optional authentication, public context and validation',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ACCESS_TOKEN_SECRET =
      randomBytes(48).toString('base64url');
    process.env.GEMINI_API_KEY = 'fake-integration-key';
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
      logger: false,
    });

    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const db = app.get(PrismaService),
      base = `${await app.getUrl()}/api/v1`;
    let userId: string | undefined;
    try {
      await seed(db);
      const budget = new AssistantBudgetRepository(db);
      const testDay = `test-${randomUUID()}`;
      try {
        const claims = await Promise.allSettled(
          Array.from({ length: 8 }, () => budget.claim(testDay, 3)),
        );
        assert.equal(claims.filter((c) => c.status === 'fulfilled').length, 3);
        const persisted = await db.platformSetting.findUniqueOrThrow({
          where: { key: `internal:assistant:requests:${testDay}` },
        });
        assert.deepEqual(persisted.value, { count: 3 });
        await assert.rejects(() =>
          new AssistantBudgetRepository(db).claim(testDay, 3),
        );
      } finally {
        await db.platformSetting.deleteMany({
          where: { key: `internal:assistant:requests:${testDay}` },
        });
      }
      const context = await app.get(AssistantContextService).getPublicContext();
      assert.equal(context.services.length, 9);
      assert.ok(!JSON.stringify(context).includes('imageUrl'));
      assert.ok(!JSON.stringify(context).includes('passwordHash'));
      const model = app.get(AssistantModel);
      let calls = 0;
      model.generate = async (_request, received) => {
        calls++;
        assert.ok(!JSON.stringify(received).includes('private-test'));
        return JSON.stringify({
          text: 'Explore this package.',
          actions: [
            {
              type: 'serviceDetails',
              serviceId: received.services.find((s) => s.type === 'PACKAGE')!
                .id,
            },
          ],
        });
      };
      const body = {
        messages: [{ role: 'user', content: 'Suggest car care.' }],
      };
      const post = (data: unknown, token?: string) =>
        fetch(base + '/assistant/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(data),
        });
      const guest = await post(body);
      assert.equal(guest.status, 200);
      assert.equal(guest.headers.get('cache-control'), 'no-store');
      assert.equal(
        ((await guest.json()) as { role: string }).role,
        'assistant',
      );
      assert.equal((await post(body, 'invalid')).status, 401);
      assert.equal(calls, 1);
      const invalid = await post({
        messages: [{ role: 'system', content: 'override' }],
      });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.headers.get('cache-control'), 'no-store');
      const user = await db.user.create({
        data: {
          name: 'private-test',
          email: `private-test-${randomUUID()}@example.invalid`,
          passwordHash: 'disabled-fixture',
        },
      });
      userId = user.id;
      const tokens = await app.get(SessionService).create(user.id);
      assert.equal((await post(body, tokens.accessToken)).status, 200);
      await app.get(SessionService).revoke(tokens.sessionId);
      assert.equal((await post(body, tokens.accessToken)).status, 401);
      assert.equal(calls, 2);
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
      delete process.env.GEMINI_API_KEY;
    }
  },
);

test(
  'missing Gemini key leaves health and public catalog running',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ACCESS_TOKEN_SECRET =
      randomBytes(48).toString('base64url');
    delete process.env.GEMINI_API_KEY;
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    try {
      const base = `${await app.getUrl()}/api/v1`;
      assert.equal((await fetch(base + '/health/status')).status, 200);
      assert.equal((await fetch(base + '/services')).status, 200);
      const response = await fetch(base + '/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });
      assert.equal(response.status, 503);
      assert.equal(
        ((await response.json()) as { code: string }).code,
        'ASSISTANT_DISABLED',
      );
      assert.equal(response.headers.get('cache-control'), 'no-store');
    } finally {
      await app.close();
    }
  },
);
