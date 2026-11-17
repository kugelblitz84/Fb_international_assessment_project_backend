import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}
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
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      businessHours,
    };
  }
}
