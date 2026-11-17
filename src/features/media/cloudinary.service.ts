import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { APP_CONFIG } from '../../core/config/app-config';
import type { AppConfig } from '../../core/config/app-config';

@Injectable()
export class CloudinaryService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  private options() {
    const c = this.config.cloudinary;
    if (!c.cloudName || !c.apiKey || !c.apiSecret)
      throw new ServiceUnavailableException({
        code: 'MEDIA_DISABLED',
        message: 'Cloudinary image uploads are not configured.',
      });
    return {
      cloud_name: c.cloudName,
      api_key: c.apiKey,
      api_secret: c.apiSecret,
      secure: true,
      timeout: 20000,
    };
  }
  async upload(
    data: Buffer,
    id: string,
  ): Promise<{ publicId: string; secureUrl: string }> {
    const options = this.options();
    try {
      return await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            ...options,
            resource_type: 'image',
            public_id: `${this.config.cloudinary.folder}/${id}`,
            overwrite: false,
            unique_filename: false,
            allowed_formats: ['jpg', 'png', 'webp'],
          },
          (error, result) => {
            if (
              error ||
              !result ||
              !result.secure_url.startsWith('https://') ||
              result.public_id !== `${this.config.cloudinary.folder}/${id}`
            )
              reject(new Error('Upload unavailable'));
            else
              resolve({
                publicId: result.public_id,
                // Keep the original; optimize only delivery with perceptual quality.
                secureUrl: result.secure_url.replace(
                  '/image/upload/',
                  '/image/upload/f_auto,q_auto:good/',
                ),
              });
          },
        );
        stream.on('error', reject);
        stream.end(data);
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'MEDIA_PROVIDER_UNAVAILABLE',
        message: 'Image storage is temporarily unavailable. Please try again.',
      });
    }
  }
  async cleanup(publicId: string) {
    // Only the caller's newly generated upload ID is ever supplied here.
    await cloudinary.uploader.destroy(publicId, {
      ...this.options(),
      resource_type: 'image',
      invalidate: true,
    });
  }
}
