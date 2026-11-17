import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../../core/auth/decorators/public.decorator';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { MediaService } from './media.service';
import { MAX_IMAGE_BYTES } from './image-signature';
@Roles('ADMIN')
@Controller({ path: 'admin/media/images', version: '1' })
export class AdminMediaController {
  constructor(private readonly service: MediaService) {}
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file)
      throw new BadRequestException(
        'Supply one image in multipart field file.',
      );
    return this.service.upload(file.buffer);
  }
}
@Controller({ path: 'media/images', version: '1' })
export class MediaController {
  constructor(private readonly service: MediaService) {}
  @Public()
  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() response: Response,
  ) {
    const image = await this.service.get(id);
    response.set({
      'Content-Type': image.mimeType,
      'Content-Length': String(image.fileSize),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    response.send(Buffer.from(image.data));
  }
}
