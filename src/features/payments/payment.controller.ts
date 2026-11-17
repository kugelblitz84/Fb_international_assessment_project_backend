import {
  HttpException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { Public } from '../../core/auth/decorators/public.decorator';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../core/auth/auth.types';
import { ZodValidationPipe } from '../../core/validator/zod-validation.pipe';
import { PaymentService } from './payment.service';
import { checkoutContact } from './sslcommerz.service';
import type { CheckoutContact } from './sslcommerz.service';

@Controller({ path: 'appointments', version: '1' })
export class AppointmentPaymentController {
  constructor(private readonly payments: PaymentService) {}
  @Post(':id/pay')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  pay(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(checkoutContact)) body: CheckoutContact,
  ) {
    return this.payments.initiate(id, auth, body);
  }
  @Get(':id/payments')
  @Header('Cache-Control', 'no-store')
  list(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() auth: AuthenticatedUser,
  ) {
    return this.payments.listOwned(id, auth);
  }
}

@Controller({ path: 'payments', version: '1' })
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}
  @Public() @Get('config') config() {
    return this.payments.capabilities();
  }
  @Get(':id') get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() auth: AuthenticatedUser,
  ) {
    return this.payments.get(id, auth);
  }
  @Post(':id/reconcile')
  @HttpCode(200)
  reconcile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(z.object({}).strict().default({})))
    _body: Record<string, never>,
  ) {
    void _body;
    return this.payments.reconcile(id, auth);
  }
}
const filters = z
  .object({
    status: z
      .enum([
        'initiating',
        'pending',
        'paid',
        'failed',
        'cancelled',
        'expired',
        'review_required',
      ])
      .transform(
        (s) =>
          s.toUpperCase() as
            | 'INITIATING'
            | 'PENDING'
            | 'PAID'
            | 'FAILED'
            | 'CANCELLED'
            | 'EXPIRED'
            | 'REVIEW_REQUIRED',
      )
      .optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to),
    'from must not follow to',
  );
@Roles('ADMIN')
@Controller({ path: 'admin/payments', version: '1' })
export class AdminPaymentController {
  constructor(private readonly payments: PaymentService) {}
  @Get() list(
    @Query(new ZodValidationPipe(filters)) query: z.infer<typeof filters>,
  ) {
    return this.payments.adminList(query);
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.payments.adminGet(id);
  }
  @Post(':id/reconcile')
  @HttpCode(200)
  reconcile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(z.object({}).strict().default({})))
    _body: Record<string, never>,
  ) {
    void _body;
    return this.payments.reconcile(id, auth);
  }
}

// These four methods alone accept public gateway mutations. All values are untrusted.
@Controller({ path: 'payments/sslcommerz', version: '1' })
export class SslcommerzCallbackController {
  constructor(private readonly payments: PaymentService) {}
  private async completion(body: unknown) {
    try {
      await this.payments.callback(body);
    } catch (error) {
      if (
        !(error instanceof HttpException) ||
        ![429, 503].includes(error.getStatus())
      )
        throw error;
    }
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AutoCare payment</title><h1>Payment processing finished</h1><p>Verification may still be pending. Return to AutoCare and refresh your payment status.</p></html>';
  }
  @Public()
  @Post('success')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  success(@Body() body: unknown) {
    return this.completion(body);
  }
  @Public()
  @Post('fail')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  fail(@Body() body: unknown) {
    return this.completion(body);
  }
  @Public()
  @Post('cancel')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  cancel(@Body() body: unknown) {
    return this.completion(body);
  }
  @Public()
  @Post('ipn')
  @HttpCode(200)
  async ipn(@Body() body: unknown) {
    await this.payments.callback(body);
    return { acknowledged: true };
  }
}
