import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { APP_CONFIG } from '../../core/config/app-config';
import type { AppConfig } from '../../core/config/app-config';
import { imageMime } from './image-signature';
@Injectable()
export class MediaService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async upload(data: Buffer) {
    if (!this.config.publicApiBaseUrl)
      throw new ServiceUnavailableException(
        'Image uploads require PUBLIC_API_BASE_URL.',
      );
    const mimeType = imageMime(data);
    const id = randomUUID();
    await this.db.mediaAsset.create({
      data: {
        id,
        data: Uint8Array.from(data),
        mimeType,
        fileSize: data.length,
      },
      select: { id: true },
    });
    return {
      id,
      imageUrl: this.config.publicApiBaseUrl + '/media/images/' + id,
    };
  }
  async get(id: string) {
    const row = await this.db.mediaAsset.findUnique({
      where: { id },
      select: { data: true, mimeType: true, fileSize: true },
    });
    if (!row) throw new NotFoundException('Image not found.');
    return row;
  }
}
