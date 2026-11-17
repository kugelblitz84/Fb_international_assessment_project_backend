import { Injectable } from '@nestjs/common';
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
  ) {}
  create(userId: string, input: CreateAppointment) {
    return this.repository.reserve(userId, input, (service, now) =>
      this.pricing.calculate(service.price, service.offers, now),
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
