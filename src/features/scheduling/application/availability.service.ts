import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../core/config/app-config';
import type { AppConfig } from '../../../core/config/app-config';
import { SchedulingRepository } from '../data/scheduling.repository';
import {
  assertBookingDate,
  insideBusinessHours,
  localInstant,
  WORKSHOP_TIME_ZONE,
  workshopTime,
} from '../domain/workshop-time';
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly repository: SchedulingRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async getAvailability(serviceId: string, date: string) {
    const now = new Date();
    assertBookingDate(date, this.config.booking.horizonDays, now);
    const dayStart = localInstant(date, '00:00');
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const { service, bays, hours } = await this.repository.context(
      serviceId,
      dayOfWeek,
    );
    const generated: {
      serviceId: string;
      bayId: string;
      startsAt: Date;
      endsAt: Date;
    }[] = [];
    for (const hoursInterval of hours) {
      const closing = localInstant(date, hoursInterval.closesAt).getTime();
      for (
        let time = localInstant(date, hoursInterval.opensAt).getTime();
        time + service.durationMinutes * 60000 <= closing;
        time += this.config.booking.slotStepMinutes * 60000
      ) {
        for (const bay of bays)
          generated.push({
            serviceId,
            bayId: bay.id,
            startsAt: new Date(time),
            endsAt: new Date(time + service.durationMinutes * 60000),
          });
      }
    }
    await this.repository.persist(generated);
    const [slots, reservations] = await Promise.all([
      this.repository.slots(serviceId, dayStart, dayEnd),
      this.repository.reservations(dayStart, dayEnd),
    ]);
    return {
      date,
      timeZone: WORKSHOP_TIME_ZONE,
      slots: slots
        .filter(
          (s) =>
            s.startsAt > now &&
            s.endsAt.getTime() - s.startsAt.getTime() ===
              service.durationMinutes * 60000 &&
            insideBusinessHours(s.startsAt, s.endsAt, hours),
        )
        .map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          workshopTime: workshopTime(s.startsAt),
          timeZone: WORKSHOP_TIME_ZONE,
          available: !reservations.some(
            (r) =>
              r.bayId === s.bayId &&
              r.startsAt < s.endsAt &&
              r.endsAt > s.startsAt,
          ),
        })),
    };
  }
}
