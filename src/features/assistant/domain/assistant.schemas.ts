import { z } from 'zod';
export const assistantRequestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine(
    (r) => r.messages.at(-1)?.role === 'user',
    'The final message must be from the user.',
  )
  .refine(
    (r) => r.messages.reduce((n, m) => n + m.content.length, 0) <= 12000,
    'Conversation is too large.',
  );
export const assistantActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('serviceDetails'), serviceId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal('browseServices'),
      categoryId: z.uuid().optional(),
    })
    .strict(),
]);
export const generatedResponseSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    actions: z.array(assistantActionSchema).max(12),
  })
  .strict();
// Explicit provider-compatible JSON Schema; Zod remains the stricter runtime validator.
export const geminiResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'actions'],
  properties: {
    text: {
      type: 'string',
      description:
        'Brief grounded guidance without numeric prices, discounts, URLs, or appointment times. The server supplies authoritative price lines.',
    },
    actions: {
      type: 'array',
      maxItems: 4,
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'serviceId'],
            properties: {
              type: { type: 'string', enum: ['serviceDetails'] },
              serviceId: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['browseServices'] },
              categoryId: { type: 'string' },
            },
          },
        ],
      },
    },
  },
};
