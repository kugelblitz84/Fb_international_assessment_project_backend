import type { z } from 'zod';
import type {
  assistantRequestSchema,
  assistantActionSchema,
} from './assistant.schemas';
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantAction = z.infer<typeof assistantActionSchema>;
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  text: string;
  actions: AssistantAction[];
}
export interface AssistantContext {
  generatedAt: string;
  platform: unknown;
  categories: { id: string; name: string }[];
  offers: {
    id: string;
    serviceId: string;
    title: string;
    description: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: number;
    startsAt: string;
    endsAt: string;
    effectivePrice: number;
    currency: string;
  }[];
  services: {
    id: string;
    name: string;
    description: string;
    categoryId: string;
    categoryName: string;
    type: 'INDIVIDUAL' | 'PACKAGE';
    originalPrice: number;
    effectivePrice: number;
    currency: string;
    durationMinutes: number;
    inclusions: string[];
    available: boolean;
    isFeatured: boolean;
    activeOffer: unknown;
    packageItems: { serviceId: string; name: string; quantity: number }[];
  }[];
  booking: {
    timeZone: string;
    horizonDays: number;
    requiresLiveSlotSelection: true;
  };
}
export abstract class AssistantModel {
  abstract generate(
    request: AssistantRequest,
    context: AssistantContext,
    signal: AbortSignal,
  ): Promise<string>;
}
