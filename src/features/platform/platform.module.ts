import { Controller, Get, Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { Public } from '../../core/auth/decorators/public.decorator';
import { PlatformService } from './platform.service';
@Public()
@Controller({ path: 'platform', version: '1' })
class PlatformController {
  constructor(private readonly platform: PlatformService) {}
  @Get() get() {
    return this.platform.getPublicKnowledge();
  }
}
@Module({
  imports: [PrismaModule],
  providers: [PlatformService],
  controllers: [PlatformController],
  exports: [PlatformService],
})
export class PlatformModule {}
