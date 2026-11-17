import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../core/config/app-config';
import type { AppConfig } from '../../core/config/app-config';
import { PrismaService } from '../../core/database/prisma.service';
const publicKeys = [
  'platformName',
  'description',
  'currency',
  'timeZone',
  'bookingPolicy',
  'cancellationPolicy',
  'bookingStatuses',
  'packageRules',
  'offerRules',
  'faqs',
];
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async getPublicKnowledge() {
    const [settings, businessHours] = await Promise.all([
      this.prisma.platformSetting.findMany({
        where: { key: { in: publicKeys } },
        select: { key: true, value: true },
      }),
      this.prisma.businessHours.findMany({
        select: {
          dayOfWeek: true,
          opensAt: true,
          closesAt: true,
          isClosed: true,
        },
        orderBy: [{ dayOfWeek: 'asc' }, { opensAt: 'asc' }],
      }),
    ]);
    return {
      booking: {
        horizonDays: this.config.booking.horizonDays,
        slotStepMinutes: this.config.booking.slotStepMinutes,
        timeZone: this.config.booking.timeZone,
      },
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      businessHours,
    };
  }
}
