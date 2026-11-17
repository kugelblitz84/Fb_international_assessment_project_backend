import { Logger } from '@nestjs/common';
import { bootstrap } from './app/bootstrap';

void bootstrap().catch(() => {
  // Driver errors may contain connection credentials; keep startup output safe.
  Logger.error(
    'Application startup failed. Check configuration and database connectivity.',
    'Bootstrap',
  );
  process.exitCode = 1;
});
