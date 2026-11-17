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
import { AdminCategoryService } from '../application/admin-category.service';
import { categoryCreate, categoryUpdate } from '../domain/admin.schemas';
@Roles('ADMIN')
@Controller({ path: 'admin/categories', version: '1' })
export class AdminCategoryController {
  constructor(private readonly service: AdminCategoryService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @Post() create(
    @Body(new ZodValidationPipe(categoryCreate))
    input: z.infer<typeof categoryCreate>,
  ) {
    return this.service.create(input);
  }
  @Patch(':id') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(categoryUpdate))
    input: z.infer<typeof categoryUpdate>,
  ) {
    return this.service.update(id, input);
  }
}
