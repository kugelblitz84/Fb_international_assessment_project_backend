import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import type {
  CatalogFilters,
  CatalogServiceRecord,
} from '../domain/catalog.types';
export const activeCatalog = {
  isActive: true,
  category: { isActive: true },
  packageItems: {
    every: { service: { isActive: true, category: { isActive: true } } },
  },
} satisfies Prisma.ServiceWhereInput;
const include = {
  category: true,
  offers: true,
  packageItems: {
    include: { service: { include: { category: true } } },
    orderBy: { serviceId: 'asc' as const },
  },
} satisfies Prisma.ServiceInclude;
type Row = Prisma.ServiceGetPayload<{ include: typeof include }>;
export function catalogRecord(row: Row): CatalogServiceRecord {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    type: row.type,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.price,
    currency: row.currency,
    durationMinutes: row.durationMinutes,
    imageUrl: row.imageUrl,
    inclusions: row.inclusions,
    isFeatured: row.isFeatured,
    offers: row.offers.map((o) => ({
      id: o.id,
      serviceId: o.serviceId,
      title: o.title,
      description: o.description,
      discountType: o.discountType,
      discountValue: o.discountValue,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      isActive: o.isActive,
    })),
    packageItems: row.packageItems.map((i) => ({
      serviceId: i.serviceId,
      name: i.service.name,
      quantity: i.quantity,
      available: i.service.isActive && i.service.category.isActive,
    })),
  };
}
@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(filters: CatalogFilters) {
    const rows = await this.prisma.service.findMany({
      where: {
        ...activeCatalog,
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.featured !== undefined
          ? { isFeatured: filters.featured }
          : {}),
        ...(filters.search
          ? {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                {
                  description: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(catalogRecord);
  }
  async find(id: string) {
    const row = await this.prisma.service.findFirst({
      where: { id, ...activeCatalog },
      include,
    });
    return row ? catalogRecord(row) : null;
  }
  categories() {
    return this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }
  offers(now: Date) {
    return this.prisma.offer.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
        service: activeCatalog,
      },
      orderBy: { id: 'asc' },
    });
  }
  static bookingInclude = include;
}
