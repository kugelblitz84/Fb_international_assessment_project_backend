import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../../core/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../core/auth/auth.types';
import { ZodValidationPipe } from '../../../core/validator/zod-validation.pipe';
import { AppointmentService } from '../application/appointment.service';
const create = z
  .object({
    serviceId: z.uuid(),
    slotId: z.uuid(),
    vehicleId: z.uuid().optional(),
  })
  .strict();
const filters = z
  .object({
    status: z
      .enum(['pending', 'confirmed', 'cancelled', 'completed'])
      .optional(),
    period: z.enum(['upcoming', 'previous']).optional(),
  })
  .strict();
@Controller({ path: 'appointments', version: '1' })
export class AppointmentController {
  constructor(private readonly appointments: AppointmentService) {}
  @Post() create(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(create)) input: z.infer<typeof create>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.appointments.create(auth.userId, input);
  }
  @Get() list(
    @CurrentUser() auth: AuthenticatedUser,
    @Query(new ZodValidationPipe(filters)) query: z.infer<typeof filters>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.appointments.listForUser(auth.userId, query);
  }
  @Get(':id') details(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.appointments.getOwned(auth.userId, id);
  }
  @Patch(':id/cancel') cancel(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({}).strict()))
    _input: Record<string, never>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.appointments.cancel(auth.userId, id);
  }
}
