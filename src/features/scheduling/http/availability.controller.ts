import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../../core/auth/decorators/public.decorator';
import { ZodValidationPipe } from '../../../core/validator/zod-validation.pipe';
import { AvailabilityService } from '../application/availability.service';
const query = z.object({ date: z.iso.date() }).strict();
@Public()
@Controller({ path: 'services', version: '1' })
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}
  @Get(':id/availability')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(query)) input: z.infer<typeof query>,
  ) {
    return this.availability.getAvailability(id, input.date);
  }
}
