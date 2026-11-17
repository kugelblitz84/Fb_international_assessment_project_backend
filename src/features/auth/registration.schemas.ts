import { z } from 'zod';
const profile = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email().trim().toLowerCase().max(320),
});
export const login = z
  .object({
    email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
    password: z.string().min(1).max(256),
  })
  .strict();
export const register = profile
  .extend({ email: login.shape.email, password: z.string().min(10).max(256) })
  .strict();
export const update = z
  .object({
    name: profile.shape.name.optional(),
    email: login.shape.email.optional(),
  })
  .strict()
  .refine((x) => Object.keys(x).length > 0, 'Supply name or email.');
