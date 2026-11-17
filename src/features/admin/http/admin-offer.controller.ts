import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../../core/auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../core/validator/zod-validation.pipe';
import { AdminOfferService } from '../application/admin-offer.service';
import { offerCreate, offerUpdate } from '../domain/admin.schemas';
@Roles('ADMIN')
@Controller({ path: 'admin/offers', version: '1' })
export class AdminOfferController {
  constructor(private readonly service: AdminOfferService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @Post() create(
    @Body(new ZodValidationPipe(offerCreate))
    input: z.infer<typeof offerCreate>,
  ) {
    return this.service.save(undefined, input);
  }
  @Patch(':id') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(offerUpdate))
    input: z.infer<typeof offerUpdate>,
  ) {
    return this.service.save(id, input);
  }
}
