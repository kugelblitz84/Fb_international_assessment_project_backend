import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../core/config/app-config';
import type { AppConfig, NodeEnvironment } from '../../core/config/app-config';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
  environment: NodeEnvironment;
}

@Injectable()
export class HealthService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  getStatus(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: this.config.nodeEnv,
    };
  }
}
