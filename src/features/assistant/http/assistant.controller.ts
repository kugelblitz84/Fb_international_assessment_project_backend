import { Body, Controller, Post, Req, Res, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { OptionalAuth } from '../../../core/auth/decorators/optional-auth.decorator';
import type { AuthenticatedRequest } from '../../../core/auth/auth.types';
import { ZodValidationPipe } from '../../../core/validator/zod-validation.pipe';
import { assistantRequestSchema } from '../domain/assistant.schemas';
import type { AssistantRequest } from '../domain/assistant.types';
import { AssistantService } from '../application/assistant.service';
@OptionalAuth()
@Controller({ path: 'assistant', version: '1' })
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}
  @Post('chat')
  @HttpCode(200)
  chat(
    @Body(new ZodValidationPipe(assistantRequestSchema))
    input: AssistantRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.assistant.chat(
      input,
      request.ip ?? 'unknown',
      request.user?.userId,
    );
  }
}
