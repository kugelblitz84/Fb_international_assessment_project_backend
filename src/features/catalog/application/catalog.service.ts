import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogRepository } from '../data/catalog.repository';
import { PricingService } from '../domain/pricing.service';
import { Decimal } from '../domain/catalog.types';
import type {
  CatalogFilters,
  CatalogServiceRecord,
  ServiceDto,
} from '../domain/catalog.types';
@Injectable()
export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly pricing: PricingService,
  ) {}
  toDto(service: CatalogServiceRecord, now = new Date()): ServiceDto {
    const calculated = this.pricing.calculate(
      service.price,
      service.offers,
      now,
    );
    return {
      id: service.id,
      name: service.name,
      slug: service.slug,
      description: service.description,
      categoryId: service.categoryId,
      categoryName: service.categoryName,
      type: service.type,
      price: calculated.price.toNumber(),
      originalPrice: service.price.toNumber(),
      effectivePrice: calculated.price.toNumber(),
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      imageUrl: service.imageUrl,
      inclusions: service.inclusions,
      available: true,
      isFeatured: service.isFeatured,
      activeOffer: calculated.offer
        ? this.pricing.offerDto(calculated.offer)
        : null,
      packageItems: service.packageItems,
    };
  }
  async listServices(filters: CatalogFilters = {}) {
    const now = new Date();
    return (await this.repository.list(filters))
      .filter((s) => {
        const price = this.pricing.calculate(s.price, s.offers, now).price;
        return (
          (!filters.minPrice || price.gte(new Decimal(filters.minPrice))) &&
          (!filters.maxPrice || price.lte(new Decimal(filters.maxPrice)))
        );
      })
      .map((s) => this.toDto(s, now));
  }
  async getService(id: string) {
    const service = await this.repository.find(id);
    if (!service) throw new NotFoundException('Service not found.');
    return this.toDto(service);
  }
  listCategories() {
    return this.repository.categories();
  }
  async listOffers() {
    const now = new Date();
    return (await this.repository.offers(now))
      .filter((o) => this.pricing.eligible(o, now))
      .map((o) => this.pricing.offerDto(o));
  }
  async getOffer(id: string) {
    const offer = (await this.listOffers()).find((o) => o.id === id);
    if (!offer) throw new NotFoundException('Offer not found.');
    return offer;
  }
}
