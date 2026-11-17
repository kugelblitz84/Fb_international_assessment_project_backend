import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../../core/auth/decorators/public.decorator';
import { ZodValidationPipe } from '../../../core/validator/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';
import { Decimal } from '../domain/catalog.types';
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const filters = z
  .object({
    search: z.string().trim().max(160).optional(),
    categoryId: z.uuid().optional(),
    type: z.enum(['INDIVIDUAL', 'PACKAGE']).optional(),
    minPrice: money.optional(),
    maxPrice: money.optional(),
    featured: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict()
  .refine(
    (f) =>
      !f.minPrice || !f.maxPrice || new Decimal(f.minPrice).lte(f.maxPrice),
    'minPrice must not exceed maxPrice.',
  );
@Public()
@Controller({ version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('services') list(
    @Query(new ZodValidationPipe(filters)) query: z.infer<typeof filters>,
  ) {
    return this.catalog.listServices(query);
  }
  @Get('services/:id') details(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.getService(id);
  }
  @Get('categories') categories() {
    return this.catalog.listCategories();
  }
  @Get('offers') offers() {
    return this.catalog.listOffers();
  }
  @Get('offers/:id') offer(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.getOffer(id);
  }
}
