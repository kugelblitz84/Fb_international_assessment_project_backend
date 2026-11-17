import { BadRequestException } from '@nestjs/common';
import {
  assertBookingDate,
  insideBusinessHours,
  workshopDate,
} from '../../scheduling/domain/workshop-time';
export interface BookingSlot {
  startsAt: Date;
  endsAt: Date;
}
export interface OpeningInterval {
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}
export function assertBookableSlot(
  slot: BookingSlot,
  durationMinutes: number,
  hours: OpeningInterval[],
  horizonDays: number,
  now: Date,
) {
  assertBookingDate(workshopDate(slot.startsAt), horizonDays, now);
  if (
    slot.startsAt <= now ||
    slot.endsAt.getTime() - slot.startsAt.getTime() !== durationMinutes * 60000
  )
    throw new BadRequestException('Slot is no longer bookable.');
  if (!insideBusinessHours(slot.startsAt, slot.endsAt, hours))
    throw new BadRequestException('Slot is outside current business hours.');
}
