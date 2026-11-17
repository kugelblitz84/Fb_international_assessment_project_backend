import { randomUUID } from 'node:crypto';
import { z } from 'zod';
export const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,10}(\.\d{1,2})?$/,
        'Use a nonnegative amount with at most 10 integer and 2 decimal digits.',
      ),
  );
const text = z.string().trim().min(1).max(200);
const imageUrl = z
  .url()
  .refine((v) => ['https:', 'http:'].includes(new URL(v).protocol))
  .nullable();
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(200);
export function slugify(name: string) {
  const generated = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return generated || randomUUID();
}
export const categoryCreate = z
  .object({
    name: text,
    slug: slug.optional(),
    description: z.string().max(10000).nullable().optional(),
    imageUrl: imageUrl.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.int().min(-2147483648).max(2147483647).optional(),
  })
  .strict();
export const categoryUpdate = categoryCreate
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Supply at least one field.');
export const serviceCreate = z
  .object({
    categoryId: z.uuid(),
    type: z.enum(['INDIVIDUAL', 'PACKAGE']),
    name: text,
    slug: slug.optional(),
    description: z.string().max(10000),
    price: money,
    currency: z.literal('BDT').default('BDT'),
    durationMinutes: z.int().positive().max(1440),
    imageUrl: imageUrl.optional(),
    inclusions: z.array(z.string().trim().min(1).max(1000)).max(100),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.int().min(-2147483648).max(2147483647).optional(),
    packageItems: z
      .array(
        z
          .object({
            serviceId: z.uuid(),
            quantity: z.int().positive().max(1000),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();
export const serviceUpdate = serviceCreate
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Supply at least one field.');
export const offerCreate = z
  .object({
    serviceId: z.uuid(),
    title: text,
    description: z.string().max(10000),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    discountValue: money,
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    isActive: z.boolean().optional(),
  })
  .strict();
export const offerUpdate = offerCreate
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Supply at least one field.');
export const statusUpdate = z
  .object({ status: z.enum(['confirmed', 'cancelled', 'completed']) })
  .strict();
export const appointmentFilters = z
  .object({
    status: z
      .enum(['pending', 'confirmed', 'cancelled', 'completed'])
      .optional(),
    date: z.iso.date().optional(),
  })
  .strict();
export type CategoryInput = z.infer<typeof categoryCreate>;
export type ServiceInput = z.infer<typeof serviceCreate>;
export type OfferInput = z.infer<typeof offerCreate>;
