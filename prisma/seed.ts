import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { demoServices } from './seed-data';

export async function seed(prisma: PrismaClient) {
  await prisma.$transaction(
    async (tx) => {
      const categories = new Map<string, string>();
      for (const [sortOrder, name] of [
        'Cleaning',
        'Detailing',
        'Maintenance',
        'Inspection',
        'Packages',
      ].entries()) {
        const slug = name.toLowerCase();
        const category = await tx.serviceCategory.upsert({
          where: { slug },
          update: {},
          create: { slug, name, sortOrder },
        });
        categories.set(slug, category.id);
      }
      const services = new Map<string, string>();
      for (const [sortOrder, service] of demoServices.entries()) {
        const { category, ...data } = service;
        const record = await tx.service.upsert({
          where: { slug: data.slug },
          update: {},
          create: {
            ...data,
            categoryId: categories.get(category)!,
            sortOrder,
            isFeatured: sortOrder < 2,
          },
        });
        services.set(data.slug, record.id);
      }
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
      for (const [sortOrder, p] of packages.entries()) {
        const { items, ...data } = p;
        const record = await tx.service.upsert({
          where: { slug: p.slug },
          update: {},
          create: {
            ...data,
            type: 'PACKAGE',
            categoryId: categories.get('packages')!,
            description: `Demonstration ${p.name} workshop package.`,
            inclusions: items.map(
              (slug) => demoServices.find((s) => s.slug === slug)!.name,
            ),
            sortOrder,
          },
        });
        services.set(p.slug, record.id);
        for (const slug of items)
          await tx.packageItem.upsert({
            where: {
              packageId_serviceId: {
                packageId: record.id,
                serviceId: services.get(slug)!,
              },
            },
            update: {},
            create: {
              packageId: record.id,
              serviceId: services.get(slug)!,
              quantity: 1,
            },
          });
      }
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + 90 * 86400000);
      for (const offer of [
        {
          id: '10000000-0000-4000-8000-000000000001',
          serviceId: services.get('interior-detail')!,
          title: 'Interior detailing introductory offer',
          description: 'Demonstration 10% discount.',
          discountType: 'PERCENTAGE' as const,
          discountValue: '10',
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          serviceId: services.get('premium-car-care')!,
          title: 'Premium package introductory offer',
          description: 'Demonstration BDT 200 discount.',
          discountType: 'FIXED_AMOUNT' as const,
          discountValue: '200',
        },
      ])
        await tx.offer.upsert({
          where: { id: offer.id },
          update: {},
          create: { ...offer, startsAt, endsAt },
        });
      for (const name of ['Bay 1', 'Bay 2'])
        await tx.serviceBay.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      // Every day 09:00-12:00 and 13:00-18:00, Asia/Dhaka. Packages fit the afternoon interval.
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++)
        for (const [opensAt, closesAt] of [
          ['09:00', '12:00'],
          ['13:00', '18:00'],
        ]) {
          await tx.businessHours.upsert({
            where: {
              dayOfWeek_opensAt_closesAt: { dayOfWeek, opensAt, closesAt },
            },
            update: {},
            create: { dayOfWeek, opensAt, closesAt },
          });
        }
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
      for (const [key, value] of Object.entries(settings))
        await tx.platformSetting.upsert({
          where: { key },
          update: {},
          create: { key, value },
        });
    },
    { timeout: 30000 },
  );
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  seed(prisma)
    .then(() => console.log('AutoCare demonstration data seeded.'))
    .catch(() => {
      console.error('Seeding failed. Check database access and migrations.');
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
