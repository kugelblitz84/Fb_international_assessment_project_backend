import { BadRequestException } from '@nestjs/common';
export const WORKSHOP_TIME_ZONE = 'Asia/Dhaka';
// Asia/Dhaka uses UTC+06:00 throughout the supported booking window.
export function workshopTime(instant: Date) {
  return new Date(instant.getTime() + 6 * 3600000).toISOString().slice(0, 19);
}
export function workshopDate(instant = new Date()) {
  return workshopTime(instant).slice(0, 10);
}
export function localInstant(date: string, time: string) {
  return new Date(`${date}T${time}:00+06:00`);
}
export function assertBookingDate(
  date: string,
  horizonDays: number,
  now = new Date(),
) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new BadRequestException('Invalid workshop date.');
  const difference =
    (parsed.getTime() - new Date(`${workshopDate(now)}T00:00:00Z`).getTime()) /
    86400000;
  if (difference < 0 || difference >= horizonDays)
    throw new BadRequestException(
      `Date must be within the next ${horizonDays} workshop calendar days, including today.`,
    );
}
export function insideBusinessHours(
  startsAt: Date,
  endsAt: Date,
  hours: { opensAt: string; closesAt: string; isClosed: boolean }[],
) {
  const date = workshopDate(startsAt);
  return hours.some(
    (h) =>
      !h.isClosed &&
      startsAt >= localInstant(date, h.opensAt) &&
      endsAt <= localInstant(date, h.closesAt),
  );
}
