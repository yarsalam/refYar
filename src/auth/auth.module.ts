import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { RecaptchaService } from 'src/recaptcha/recaptcha.service';
import { UserDeviceModule } from 'src/user-device/user-device.module';
import { UserPhonesModule } from 'src/user-phones/user-phones.module';
import { UsersService } from 'src/users/users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { RedisModule } from 'src/redis/redis.module';
import { OtpModule } from './otp/otp.module';
import { ChannelsModule } from './channels/channels.module';
import { TelegramModule } from './channels/telegram/telegram.module';
import { WhatsappModule } from './channels/whatsapp/whatsapp.module';
import { DevicePhoneModule } from './device-phone/device-phone.module';
import { UserEventModule } from 'src/user-event/user-event.module';
import { PhaseModule } from 'src/phase/phase.module';
import { FeatureStoreModule } from 'src/feature-store/feature-store.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => UsersModule),
    forwardRef(() => UserPhonesModule),
    forwardRef(() => ChannelsModule),
    forwardRef(() => PhaseModule),
    forwardRef(() => FeatureStoreModule),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '30d' },
    }),
    PassportModule,
    RedisModule,
    UserDeviceModule,
    OtpModule,
    TelegramModule,
    WhatsappModule,
    DevicePhoneModule,
    UserEventModule,
  ],
  providers: [AuthService, JwtStrategy, RecaptchaService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule], // اضافه کردن گارد به اکسپورت
})
export class AuthModule {}
