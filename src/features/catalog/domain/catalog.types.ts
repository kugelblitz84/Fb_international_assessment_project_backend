// Decimal arithmetic is supplied by Prisma's Decimal implementation; persistence models stay in data/.
import { Prisma } from '@prisma/client';
export const Decimal = Prisma.Decimal;
export type Money = Prisma.Decimal;
export interface CatalogOffer {
  id: string;
  serviceId: string;
  title: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: Money;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}
export interface CatalogServiceRecord {
  id: string;
  categoryId: string;
  categoryName: string;
  type: 'INDIVIDUAL' | 'PACKAGE';
  name: string;
  slug: string;
  description: string;
  price: Money;
  currency: string;
  durationMinutes: number;
  imageUrl: string | null;
  inclusions: string[];
  isFeatured: boolean;
  offers: CatalogOffer[];
  packageItems: {
    serviceId: string;
    name: string;
    quantity: number;
    available: boolean;
  }[];
}
export interface CatalogFilters {
  search?: string;
  categoryId?: string;
  type?: 'INDIVIDUAL' | 'PACKAGE';
  minPrice?: string;
  maxPrice?: string;
  featured?: boolean;
}
export interface OfferDto {
  id: string;
  serviceId: string;
  title: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  startsAt: string;
  endsAt: string;
}
export interface ServiceDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  categoryName: string;
  type: 'INDIVIDUAL' | 'PACKAGE';
  price: number;
  originalPrice: number;
  effectivePrice: number;
  currency: string;
  durationMinutes: number;
  imageUrl: string | null;
  inclusions: string[];
  available: boolean;
  isFeatured: boolean;
  activeOffer: OfferDto | null;
  packageItems: {
    serviceId: string;
    name: string;
    quantity: number;
    available: boolean;
  }[];
}
