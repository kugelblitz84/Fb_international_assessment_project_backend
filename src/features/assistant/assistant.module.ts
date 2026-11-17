import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PlatformModule } from '../platform/platform.module';
import { AssistantController } from './http/assistant.controller';
import { AssistantService } from './application/assistant.service';
import { AssistantContextService } from './application/assistant-context.service';
import { AssistantUsageService } from './application/assistant-usage.service';
import { AssistantModel } from './domain/assistant.types';
import { GeminiService } from './data/gemini.service';
import { AssistantBudgetRepository } from './data/assistant-budget.repository';
import { PrismaModule } from '../../core/database/prisma.module';
@Module({
  imports: [CatalogModule, PlatformModule, PrismaModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantContextService,
    AssistantUsageService,
    AssistantBudgetRepository,
    { provide: AssistantModel, useClass: GeminiService },
  ],
  exports: [AssistantService],
})
export class AssistantModule {}
