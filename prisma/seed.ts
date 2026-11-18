import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { demoServices } from './seed-data';

export async function seed(prisma: PrismaClient) {
  await prisma.$transaction(
    async (tx) => {
      const categoryRows = [
        'Cleaning',
        'Detailing',
        'Maintenance',
        'Inspection',
        'Packages',
      ].map((name, sortOrder) => ({
        slug: name.toLowerCase(),
        name,
        sortOrder,
      }));
      await tx.serviceCategory.createMany({
        data: categoryRows,
        skipDuplicates: true,
      });
      // Existing slugs can have different IDs from those generated on this run.
      const categoryRecords = await tx.serviceCategory.findMany({
        where: { slug: { in: categoryRows.map((row) => row.slug) } },
        select: { slug: true, id: true },
      });
      const categories = new Map(
        categoryRecords.map((row) => [row.slug, row.id]),
      );
      const packages = [
        {
          slug: 'express-car-care',
          name: 'Express Car Care',
          price: '1400',
          durationMinutes: 105,
          items: ['exterior-wash', 'battery-check', 'tyre-inspection'],
        },
        {
          slug: 'premium-car-care',
          name: 'Premium Car Care',
          price: '3500',
          durationMinutes: 210,
          items: ['exterior-wash', 'interior-detail', 'ac-inspection'],
        },
        {
          slug: 'essential-maintenance',
          name: 'Essential Maintenance',
          price: '3800',
          durationMinutes: 120,
          items: ['oil-change', 'battery-check', 'tyre-inspection'],
        },
      ];
      const serviceRows: Prisma.ServiceCreateManyInput[] = [
        ...demoServices.map(({ category, ...data }, sortOrder) => ({
          ...data,
          categoryId: categories.get(category)!,
          sortOrder,
          isFeatured: sortOrder < 2,
        })),
        ...packages.map(({ items, ...data }, sortOrder) => ({
          ...data,
          type: 'PACKAGE' as const,
          categoryId: categories.get('packages')!,
          description: `Demonstration ${data.name} workshop package.`,
          inclusions: items.map(
            (slug) => demoServices.find((s) => s.slug === slug)!.name,
          ),
          sortOrder,
        })),
      ];
      await tx.service.createMany({ data: serviceRows, skipDuplicates: true });
      const serviceRecords = await tx.service.findMany({
        where: { slug: { in: serviceRows.map((row) => row.slug) } },
        select: { slug: true, id: true },
      });
      const services = new Map(serviceRecords.map((row) => [row.slug, row.id]));
      await tx.packageItem.createMany({
        data: packages.flatMap((pkg) =>
          pkg.items.map((slug) => ({
            packageId: services.get(pkg.slug)!,
            serviceId: services.get(slug)!,
            quantity: 1,
          })),
        ),
        skipDuplicates: true,
      });
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + 90 * 86400000);
      await tx.offer.createMany({
        data: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            serviceId: services.get('interior-detail')!,
            title: 'Interior detailing introductory offer',
            description: 'Demonstration 10% discount.',
            discountType: 'PERCENTAGE',
            discountValue: '10',
            startsAt,
            endsAt,
          },
          {
            id: '10000000-0000-4000-8000-000000000002',
            serviceId: services.get('premium-car-care')!,
            title: 'Premium package introductory offer',
            description: 'Demonstration BDT 200 discount.',
            discountType: 'FIXED_AMOUNT',
            discountValue: '200',
            startsAt,
            endsAt,
          },
        ],
        skipDuplicates: true,
      });
      await tx.serviceBay.createMany({
        data: [{ name: 'Bay 1' }, { name: 'Bay 2' }],
        skipDuplicates: true,
      });
      // Every day 09:00-12:00 and 13:00-18:00, Asia/Dhaka. Packages fit the afternoon interval.
      const hours: Prisma.BusinessHoursCreateManyInput[] = [];
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        hours.push(
          { dayOfWeek, opensAt: '09:00', closesAt: '12:00' },
          { dayOfWeek, opensAt: '13:00', closesAt: '18:00' },
        );
      }
      await tx.businessHours.createMany({ data: hours, skipDuplicates: true });
      const settings: Record<string, Prisma.InputJsonValue> = {
        platformName: 'AutoCare',
        description:
          'A vehicle service discovery and appointment booking platform.',
        currency: 'BDT',
        timeZone: 'Asia/Dhaka',
        bookingPolicy: {
          steps: [
            'Select a service or package',
            'Choose an available slot',
            'Sign in',
            'Submit the booking',
          ],
          initialStatus: 'pending',
          vehicleRequired: false,
        },
        cancellationPolicy: {
          allowedStatuses: ['pending'],
          releasesCapacity: true,
        },
        bookingStatuses: {
          pending: 'Awaiting confirmation.',
          confirmed: 'Confirmed by the workshop.',
          cancelled: 'Cancelled; reserved capacity released.',
          completed: 'Service completed.',
        },
        packageRules: {
          independentlyBookable: true,
          nestedPackages: false,
          pricing: 'Official package price; not the sum of components.',
        },
        offerRules: {
          stacking: false,
          selection: 'Lowest valid final price; offer ID breaks ties.',
          validity: 'startsAt inclusive, endsAt exclusive',
          rounding: 'BDT two decimals, half up',
        },
        faqs: [
          {
            question: 'Do I need to register my vehicle?',
            answer: 'No. Vehicle selection is optional.',
          },
          {
            question: 'Can I cancel?',
            answer: 'Only pending appointments can be cancelled.',
          },
        ],
      };
      await tx.platformSetting.createMany({
        data: Object.entries(settings).map(([key, value]) => ({ key, value })),
        skipDuplicates: true,
      });
    },
    { maxWait: 15000, timeout: 30000 },
  );
}

if (require.main === module) {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DIRECT_URL or DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  seed(prisma)
    .then(() => console.log('AutoCare demonstration data seeded.'))
    .catch((error: unknown) => {
      const code =
        error instanceof Error && 'code' in error ? ` [${error.code}]` : '';
      const detail =
        error instanceof Error
          ? error.message || error.name
          : 'Unknown database error';
      console.error(
        `Seeding failed${code}: ${detail.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]')}`,
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
