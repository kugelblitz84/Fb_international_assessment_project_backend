import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { MediaService } from './media.service';
import { CloudinaryService } from './cloudinary.service';
import { MediaController, AdminMediaController } from './media.controller';
@Module({
  imports: [PrismaModule],
  providers: [MediaService, CloudinaryService],
  controllers: [MediaController, AdminMediaController],
})
export class MediaModule {}
