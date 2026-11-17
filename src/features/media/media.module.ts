import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { MediaService } from './media.service';
import { MediaController, AdminMediaController } from './media.controller';
@Module({
  imports: [PrismaModule],
  providers: [MediaService],
  controllers: [MediaController, AdminMediaController],
})
export class MediaModule {}
