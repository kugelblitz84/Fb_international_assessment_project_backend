import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { FeatureAuthController } from './auth.controller';
import { PasswordService } from './data/password.service';
import { UserRepository } from './data/user.repository';
import { RegisterService } from './register/register.service';
import { LoginService } from './login/login.service';
@Module({
  imports: [PrismaModule],
  controllers: [FeatureAuthController],
  providers: [PasswordService, UserRepository, RegisterService, LoginService],
})
export class FeatureAuthModule {}
