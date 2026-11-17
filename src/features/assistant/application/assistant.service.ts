import { Inject, Injectable, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../../../core/config/app-config';
import type { AppConfig } from '../../../core/config/app-config';
import { AssistantModel } from '../domain/assistant.types';
import type {
  AssistantAction,
  AssistantMessage,
  AssistantRequest,
} from '../domain/assistant.types';
import { generatedResponseSchema } from '../domain/assistant.schemas';
import { assistantError } from '../domain/assistant.error';
import { AssistantContextService } from './assistant-context.service';
import { AssistantUsageService } from './assistant-usage.service';

@Injectable()
export class AssistantService {
  constructor(
    private readonly contexts: AssistantContextService,
    private readonly model: AssistantModel,
    private readonly usage: AssistantUsageService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async chat(
    request: AssistantRequest,
    ip: string,
    userId?: string,
  ): Promise<AssistantMessage> {
    if (!this.config.gemini.apiKey)
      throw assistantError(
        503,
        'ASSISTANT_DISABLED',
        'The assistant is not configured. Browse services instead.',
      );
    const release = await this.usage.acquire(ip, userId);
    try {
      // Screen the entire untrusted history; never query user/appointment/vehicle tables.
      const history = request.messages.map((m) => m.content).join('\n');
      if (
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:bearer\s+|(?:password|secret|api[_ -]?key|refresh[_ -]?token|access[_ -]?token)\s*(?::|=|is\b)|eyJ[A-Za-z0-9_-]+\.|AIza[A-Za-z0-9_-]{25,})|(?:\+?\d[\d ()-]{8,}\d)|(?:registration|number\s*plate|license\s*plate|রেজিস্ট্রেশন)\s*(?::|=|is\b)|(?:dhaka|chattogram|chittagong|sylhet|ঢাকা|চট্টগ্রাম)[\s-]*(?:metro|মেট্রো)|[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/i.test(
          history,
        )
      )
        throw assistantError(
          400,
          'ASSISTANT_SENSITIVE_INPUT',
          'Remove emails, credentials, phone numbers and vehicle registration details before sending.',
        );
      const context = await this.contexts.getPublicContext();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let raw: string;
      try {
        raw = await Promise.race([
          this.model.generate(request, context, controller.signal),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(
                assistantError(
                  504,
                  'ASSISTANT_TIMEOUT',
                  'The assistant took too long. Try again.',
                ),
              );
            }, this.config.gemini.timeoutMs);
          }),
        ]);
      } catch (error) {
        if (error instanceof HttpException) throw error;
        throw assistantError(
          502,
          'ASSISTANT_PROVIDER_ERROR',
          'The assistant is temporarily unavailable.',
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
      let parsed: ReturnType<typeof generatedResponseSchema.parse>;
      try {
        if (Buffer.byteLength(raw) > 20000) throw new Error();
        parsed = generatedResponseSchema.parse(JSON.parse(raw));
      } catch {
        throw assistantError(
          502,
          'ASSISTANT_INVALID_RESPONSE',
          'The assistant returned an invalid answer. Browse services or try again.',
        );
      }
      if (
        parsed.text.includes(this.config.gemini.apiKey) ||
        parsed.text.includes(this.config.auth.accessTokenSecret)
      ) {
        throw assistantError(
          502,
          'ASSISTANT_INVALID_RESPONSE',
          'The assistant returned an invalid answer.',
        );
      }
      // Re-read after generation: actions and prices cannot rely on a stale provider snapshot.
      const current = await this.contexts.getPublicContext();
      const services = new Map(current.services.map((s) => [s.id, s]));
      const categories = new Set(current.categories.map((c) => c.id));
      const actions: AssistantAction[] = [];
      const keys = new Set<string>();
      for (const action of parsed.actions) {
        if (
          (action.type === 'serviceDetails' &&
            !services.has(action.serviceId)) ||
          (action.type === 'browseServices' &&
            action.categoryId &&
            !categories.has(action.categoryId))
        )
          throw assistantError(
            502,
            'ASSISTANT_INVALID_RESPONSE',
            'The recommendation is no longer available. Browse the current catalog.',
          );
        const key = JSON.stringify(action);
        if (!keys.has(key) && actions.length < 4) {
          keys.add(key);
          actions.push(action);
        }
      }
      // Exact prices/durations/offer savings are server text, never model arithmetic.
      // Replace numeric/monetary/link/time claims rather than partially trusting free text.
      const risky =
        /[\p{N}%৳$€£<>]|https?:|www\.|\/[a-z]|\b\w+\.(?:com|net|org|io)\b|(?:BDT|taka|discount|offer|saving|price|cheaper|half|sale|complimentary|free|percent|টাকা|ছাড়|ছাড়|today|tomorrow|available\s+(?:at|on)|\b(?:am|pm)\b)/iu;
      let text = risky.test(parsed.text)
        ? 'Use the current catalog details below. Select a service to check live availability.'
        : parsed.text;
      const lines = actions.flatMap((a) => {
        if (a.type !== 'serviceDetails') return [];
        const s = services.get(a.serviceId)!;
        return [
          `${s.name.slice(0, 120)}: ${s.currency} ${s.effectivePrice.toFixed(2)}${s.originalPrice > s.effectivePrice ? ` (original ${s.currency} ${s.originalPrice.toFixed(2)})` : ''}; ${s.durationMinutes} minutes.`,
        ];
      });
      if (lines.length) text += '\n\n' + lines.join('\n');
      return { id: randomUUID(), role: 'assistant', text, actions };
    } finally {
      release();
    }
  }
}
