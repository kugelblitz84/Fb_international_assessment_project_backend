import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { PaymentService } from './payment.service';
import { SslcommerzService } from './sslcommerz.service';
import {
  AdminPaymentController,
  AppointmentPaymentController,
  PaymentController,
  SslcommerzCallbackController,
} from './payment.controller';
@Module({
  imports: [PrismaModule],
  providers: [PaymentService, SslcommerzService],
  exports: [SslcommerzService],
  controllers: [
    AdminPaymentController,
    AppointmentPaymentController,
    PaymentController,
    SslcommerzCallbackController,
  ],
})
export class PaymentsModule {}
