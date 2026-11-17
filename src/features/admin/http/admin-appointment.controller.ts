import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../../core/auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../core/validator/zod-validation.pipe';
import { AdminAppointmentService } from '../application/admin-appointment.service';
import { statusUpdate, appointmentFilters } from '../domain/admin.schemas';
@Roles('ADMIN')
@Controller({ path: 'admin/appointments', version: '1' })
export class AdminAppointmentController {
  constructor(private readonly service: AdminAppointmentService) {}
  @Get() list(
    @Query(new ZodValidationPipe(appointmentFilters))
    filters: z.infer<typeof appointmentFilters>,
  ) {
    return this.service.list(filters);
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @Patch(':id/status') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(statusUpdate))
    input: z.infer<typeof statusUpdate>,
  ) {
    return this.service.transition(id, input.status);
  }
}
