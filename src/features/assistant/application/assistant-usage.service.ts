import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../core/config/app-config';
import type { AppConfig } from '../../../core/config/app-config';
import { assistantError } from '../domain/assistant.error';
import { AssistantBudgetRepository } from '../data/assistant-budget.repository';
@Injectable()
export class AssistantUsageService {
  private readonly windows = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private concurrent = 0;
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly budget: AssistantBudgetRepository,
  ) {}
  async acquire(ip: string, userId?: string): Promise<() => void> {
    const now = Date.now();
    for (const [key, value] of this.windows)
      if (value.expiresAt <= now) this.windows.delete(key);
    const day = new Date(now).toISOString().slice(0, 10);
    if (this.concurrent >= this.config.gemini.maxConcurrent)
      throw assistantError(
        429,
        'ASSISTANT_BUSY',
        'The assistant is busy. Try again shortly.',
      );
    const subjects = [`ip:${ip}`, ...(userId ? [`user:${userId}`] : [])];
    const buckets = subjects.flatMap((subject) => [
      {
        key: `minute:${subject}`,
        limit: this.config.gemini.perMinute,
        ttl: 60000,
      },
      {
        key: `hour:${subject}`,
        limit: this.config.gemini.perHour,
        ttl: 3600000,
      },
    ]);
    if (this.windows.size + buckets.length > 20000)
      throw assistantError(
        429,
        'ASSISTANT_RATE_LIMITED',
        'Too many assistant requests. Try again later.',
      );
    for (const b of buckets)
      if ((this.windows.get(b.key)?.count ?? 0) >= b.limit)
        throw assistantError(
          429,
          'ASSISTANT_RATE_LIMITED',
          'Too many assistant requests. Try again later.',
        );
    for (const b of buckets) {
      const value = this.windows.get(b.key) ?? {
        count: 0,
        expiresAt: now + b.ttl,
      };
      value.count++;
      this.windows.set(b.key, value);
    }
    this.concurrent++;
    try {
      await this.budget.claim(day, this.config.gemini.dailyBudget);
    } catch (error) {
      this.concurrent--;
      throw error;
    }
    let released = false;
    return () => {
      if (!released) {
        this.concurrent--;
        released = true;
      }
    };
  }
}
