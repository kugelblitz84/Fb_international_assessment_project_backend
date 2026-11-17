import {
  BadRequestException,
  PayloadTooLargeException,
  VersioningType,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import type { ErrorRequestHandler } from 'express';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { APP_CONFIG } from '../core/config/app-config';
import type { AppConfig } from '../core/config/app-config';
import { AppModule } from './app.module';

const bodyParserErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  _response,
  next,
): void => {
  // Parser errors can carry the submitted body. Expose only fixed messages.
  if (error instanceof Error && 'type' in error) {
    if (error.type === 'entity.too.large') {
      next(new PayloadTooLargeException('Request body is too large.'));
      return;
    }
    if (error.type === 'entity.parse.failed') {
      next(new BadRequestException('Malformed request body.'));
      return;
    }
  }
  next(error);
};

/** Configures HTTP middleware without initializing the app or opening a listener. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);

  // Forwarded headers are untrusted until deployment explicitly configures a proxy.
  app.set(
    'trust proxy',
    config.trustedProxies.length ? config.trustedProxies : false,
  );
  app.disable('x-powered-by');
  const assistantNoStore: RequestHandler = (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  };
  app.use('/api/v1/assistant', assistantNoStore);
  app.use('/api/v1/payments', assistantNoStore);
  app.use('/api/v1/admin/payments', assistantNoStore);
  app.use('/api/v1/appointments', assistantNoStore);
  app.use('/api/v1/admin/appointments', assistantNoStore);
  app.use(
    helmet({
      strictTransportSecurity:
        config.nodeEnv === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
          : false,
    }),
  );
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });
  app.use(json({ limit: config.httpBodyLimitBytes }));
  app.use(
    urlencoded({
      extended: false,
      limit: config.httpBodyLimitBytes,
      parameterLimit: 100,
    }),
  );
  app.use(bodyParserErrorHandler);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // Zod pipes are applied at request boundaries. No class-based DTOs exist yet.
  app.enableShutdownHooks();
}

export async function bootstrap(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    abortOnError: false,
  });

  try {
    configureApp(app);
    await app.init();
    const config = app.get<AppConfig>(APP_CONFIG);
    if (config.nodeEnv !== 'test') {
      await app.listen(config.port, '0.0.0.0');
    }
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
