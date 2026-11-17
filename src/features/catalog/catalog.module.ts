import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CatalogRepository } from './data/catalog.repository';
import { PricingService } from './domain/pricing.service';
import { CatalogService } from './application/catalog.service';
import { CatalogController } from './http/catalog.controller';
@Module({
  imports: [PrismaModule],
  providers: [CatalogRepository, PricingService, CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService, PricingService],
})
export class CatalogModule {}
