import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '../src/features/catalog/domain/catalog.types';
import type { CatalogOffer } from '../src/features/catalog/domain/catalog.types';
import { PricingService } from '../src/features/catalog/domain/pricing.service';
const pricing = new PricingService();
const now = new Date('2026-11-17T00:00:00Z');
function offer(overrides: Partial<CatalogOffer> = {}): CatalogOffer {
  return {
    id: 'a',
    serviceId: 's',
    title: 'Demo',
    description: 'Demo',
    discountType: 'PERCENTAGE',
    discountValue: new Decimal(10),
    startsAt: new Date('2026-11-01'),
    endsAt: new Date('2026-12-01'),
    isActive: true,
    ...overrides,
  };
}
test('pricing uses exact decimal amounts and half-up rounding', () => {
  assert.equal(
    pricing.calculate(new Decimal('100.05'), [offer()], now).price.toString(),
    '90.05',
  );
});
test('best offer wins without stacking and ties use ID', () => {
  const result = pricing.calculate(
    new Decimal(1000),
    [
      offer({ id: 'z' }),
      offer({
        id: 'b',
        discountType: 'FIXED_AMOUNT',
        discountValue: new Decimal(200),
      }),
      offer({ id: 'a', discountValue: new Decimal(20) }),
    ],
    now,
  );
  assert.equal(result.price.toString(), '800');
  assert.equal(result.offer?.id, 'a');
});
test('expired, inactive, future and invalid offers do not apply', () => {
  for (const invalid of [
    offer({ endsAt: now }),
    offer({ isActive: false }),
    offer({ startsAt: new Date('2026-12-01') }),
    offer({ discountValue: new Decimal(101) }),
    offer({ discountValue: new Decimal(-1) }),
  ])
    assert.equal(
      pricing.calculate(new Decimal(1000), [invalid], now).price.toString(),
      '1000',
    );
});
test('fixed discount cannot make price negative', () => {
  assert.equal(
    pricing
      .calculate(
        new Decimal(100),
        [
          offer({
            discountType: 'FIXED_AMOUNT',
            discountValue: new Decimal(200),
          }),
        ],
        now,
      )
      .price.toString(),
    '0',
  );
});
