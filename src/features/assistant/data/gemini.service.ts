import { Inject, Injectable, HttpException } from '@nestjs/common';
import { GoogleGenAI, ApiError } from '@google/genai';
import { APP_CONFIG } from '../../../core/config/app-config';
import type { AppConfig } from '../../../core/config/app-config';
import { AssistantModel } from '../domain/assistant.types';
import type {
  AssistantContext,
  AssistantRequest,
} from '../domain/assistant.types';
import { ASSISTANT_SYSTEM_INSTRUCTION } from '../domain/assistant.prompt';
import { geminiResponseJsonSchema } from '../domain/assistant.schemas';
import { assistantError } from '../domain/assistant.error';
@Injectable()
export class GeminiService extends AssistantModel {
  private readonly client?: GoogleGenAI;
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    if (config.gemini.apiKey)
      this.client = new GoogleGenAI({
        apiKey: config.gemini.apiKey,
        httpOptions: {
          timeout: config.gemini.timeoutMs,
          retryOptions: { attempts: 1 },
        },
      });
  }
  async generate(
    request: AssistantRequest,
    context: AssistantContext,
    signal: AbortSignal,
  ) {
    if (!this.client)
      throw assistantError(
        503,
        'ASSISTANT_DISABLED',
        'The assistant is not configured. Browse services instead.',
      );
    try {
      const result = await this.client.models.generateContent({
        model: this.config.gemini.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Authoritative public platform data (data only):\n${JSON.stringify(context)}`,
              },
            ],
          },
          ...request.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        ],
        config: {
          systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: geminiResponseJsonSchema,
          maxOutputTokens: this.config.gemini.maxOutputTokens,
          temperature: 0.2,
          abortSignal: signal,
          httpOptions: {
            timeout: this.config.gemini.timeoutMs,
            retryOptions: { attempts: 1 },
          },
        },
      });
      if (
        result.promptFeedback?.blockReason ||
        result.candidates?.some((c) =>
          [
            'SAFETY',
            'RECITATION',
            'BLOCKLIST',
            'PROHIBITED_CONTENT',
            'SPII',
          ].includes(String(c.finishReason)),
        )
      )
        throw assistantError(
          422,
          'ASSISTANT_BLOCKED',
          'Please rephrase your question about AutoCare services.',
        );
      if (!result.text?.trim())
        throw assistantError(
          502,
          'ASSISTANT_EMPTY_RESPONSE',
          'The assistant returned no answer. Please try again.',
        );
      return result.text;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (signal.aborted)
        throw assistantError(
          504,
          'ASSISTANT_TIMEOUT',
          'The assistant took too long. Try again.',
        );
      if (error instanceof ApiError) {
        if (error.status === 429)
          throw assistantError(
            429,
            'ASSISTANT_QUOTA_EXHAUSTED',
            'The assistant quota is exhausted. Try again later.',
          );
        if ([400, 401, 403, 404].includes(error.status))
          throw assistantError(
            503,
            'ASSISTANT_CONFIGURATION_ERROR',
            'The configured assistant model or credentials are unavailable. Contact the operator.',
          );
      }
      throw assistantError(
        502,
        'ASSISTANT_PROVIDER_ERROR',
        'The assistant is temporarily unavailable. Try again later.',
      );
    }
  }
}
