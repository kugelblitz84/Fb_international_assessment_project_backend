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
import { AdminCatalogService } from '../application/admin-catalog.service';
import { serviceCreate, serviceUpdate } from '../domain/admin.schemas';
@Roles('ADMIN')
@Controller({ path: 'admin/services', version: '1' })
export class AdminCatalogController {
  constructor(private readonly service: AdminCatalogService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @Post() create(
    @Body(new ZodValidationPipe(serviceCreate))
    input: z.infer<typeof serviceCreate>,
  ) {
    return this.service.save(undefined, input);
  }
  @Patch(':id') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(serviceUpdate))
    input: z.infer<typeof serviceUpdate>,
  ) {
    return this.service.save(id, input);
  }
}
