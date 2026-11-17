import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../core/config/app-config';
import type { AppConfig } from '../../../core/config/app-config';
import { assertBookableSlot } from '../domain/booking-policy';
import { AppointmentRepository } from '../data/appointment.repository';
import type {
  AppointmentFilters,
  CreateAppointment,
} from '../domain/appointment.types';
import { PricingService } from '../../catalog/domain/pricing.service';
@Injectable()
export class AppointmentService {
  constructor(
    private readonly repository: AppointmentRepository,
    private readonly pricing: PricingService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  create(userId: string, input: CreateAppointment) {
    return this.repository.reserve(
      userId,
      input,
      (service, now, slot, hours) => {
        assertBookableSlot(
          slot,
          service.durationMinutes,
          hours,
          this.config.booking.horizonDays,
          now,
        );
        return this.pricing.calculate(service.price, service.offers, now);
      },
    );
  }
  listForUser(userId: string, filters: AppointmentFilters = {}) {
    return this.repository.list(userId, filters);
  }
  getOwned(userId: string, id: string) {
    return this.repository.getOwned(userId, id);
  }
  cancel(userId: string, id: string) {
    return this.repository.cancel(userId, id);
  }
}
