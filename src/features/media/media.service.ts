import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { CloudinaryService } from './cloudinary.service';
import { imageMime } from './image-signature';
@Injectable()
export class MediaService {
  constructor(
    private readonly db: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}
  async upload(data: Buffer) {
    const mimeType = imageMime(data);
    const id = randomUUID();
    const uploaded = await this.cloudinary.upload(data, id);
    try {
      await this.db.mediaAsset.create({
        data: {
          id,
          storageProvider: 'CLOUDINARY',
          cloudinaryPublicId: uploaded.publicId,
          cloudinarySecureUrl: uploaded.secureUrl,
          mimeType,
          fileSize: data.length,
        },
        select: { id: true },
      });
    } catch {
      try {
        await this.cloudinary.cleanup(uploaded.publicId);
      } catch {
        /* Best effort; no provider response or credentials in logs. */
      }
      throw new ServiceUnavailableException({
        code: 'MEDIA_PERSISTENCE_FAILED',
        message: 'Unable to save the image. Please try again.',
      });
    }
    return {
      id,
      imageUrl: uploaded.secureUrl,
    };
  }
  async get(id: string) {
    const row = await this.db.mediaAsset.findUnique({
      where: { id },
      select: { data: true, mimeType: true, fileSize: true },
    });
    if (!row?.data) throw new NotFoundException('Legacy image not found.');
    return { ...row, data: row.data };
  }
}
