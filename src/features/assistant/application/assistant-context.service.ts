import { Inject, Injectable } from '@nestjs/common';
import { CatalogService } from '../../catalog/application/catalog.service';
import { PlatformService } from '../../platform/platform.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import type { AppConfig } from '../../../core/config/app-config';
import type { AssistantContext } from '../domain/assistant.types';
import { assistantError } from '../domain/assistant.error';
@Injectable()
export class AssistantContextService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly platform: PlatformService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async getPublicContext(): Promise<AssistantContext> {
    const [services, categories, platform, offers] = await Promise.all([
      this.catalog.listServices(),
      this.catalog.listCategories(),
      this.platform.getPublicKnowledge(),
      this.catalog.listOffers(),
    ]);
    const context: AssistantContext = {
      generatedAt: new Date().toISOString(),
      platform,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      offers: offers.flatMap((offer) => {
        const service = services.find((s) => s.id === offer.serviceId);
        return service
          ? [
              {
                ...offer,
                effectivePrice: service.effectivePrice,
                currency: service.currency,
              },
            ]
          : [];
      }),
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        type: s.type,
        originalPrice: s.originalPrice,
        effectivePrice: s.effectivePrice,
        currency: s.currency,
        durationMinutes: s.durationMinutes,
        inclusions: s.inclusions,
        available: s.available,
        isFeatured: s.isFeatured,
        activeOffer: s.activeOffer,
        packageItems: s.packageItems.map((i) => ({
          serviceId: i.serviceId,
          name: i.name,
          quantity: i.quantity,
        })),
      })),
      booking: {
        timeZone: this.config.booking.timeZone,
        horizonDays: this.config.booking.horizonDays,
        requiresLiveSlotSelection: true,
      },
    };
    if (Buffer.byteLength(JSON.stringify(context), 'utf8') > 48000)
      throw assistantError(
        503,
        'ASSISTANT_CONTEXT_TOO_LARGE',
        'The catalog is too large for the assistant. Browse services instead.',
      );
    return context;
  }
}
