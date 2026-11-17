import { Injectable } from '@nestjs/common';
import { Decimal } from './catalog.types';
import type { CatalogOffer, Money, OfferDto } from './catalog.types';
@Injectable()
export class PricingService {
  eligible(offer: CatalogOffer, now: Date) {
    return (
      offer.isActive &&
      offer.startsAt <= now &&
      offer.endsAt > now &&
      offer.startsAt < offer.endsAt &&
      offer.discountValue.gt(0) &&
      (offer.discountType !== 'PERCENTAGE' || offer.discountValue.lte(100))
    );
  }
  calculate(basePrice: Money, offers: CatalogOffer[], now = new Date()) {
    let price = basePrice;
    let selected: CatalogOffer | null = null;
    for (const offer of [...offers].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!this.eligible(offer, now)) continue;
      const discounted =
        offer.discountType === 'PERCENTAGE'
          ? basePrice.mul(new Decimal(100).minus(offer.discountValue)).div(100)
          : basePrice.minus(offer.discountValue);
      const final = Decimal.max(0, discounted).toDecimalPlaces(
        2,
        Decimal.ROUND_HALF_UP,
      );
      if (final.lt(price)) {
        price = final;
        selected = offer;
      }
    }
    return { basePrice, price, offer: selected };
  }
  offerDto(offer: CatalogOffer): OfferDto {
    return {
      id: offer.id,
      serviceId: offer.serviceId,
      title: offer.title,
      description: offer.description,
      discountType: offer.discountType,
      discountValue: offer.discountValue.toNumber(),
      startsAt: offer.startsAt.toISOString(),
      endsAt: offer.endsAt.toISOString(),
    };
  }
}
