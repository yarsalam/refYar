import { forwardRef, Module } from '@nestjs/common';
import { UserPhonesService } from './user-phones.service';
import { UserPhonesController } from './user-phones.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPhone } from './entities/user-phone.entity';
import { User } from 'src/users/entities/user.entity';
import { AuthModule } from 'src/auth/auth.module';
import { RedisModule } from 'src/redis/redis.module';
import { TelegramModule } from 'src/auth/channels/telegram/telegram.module';
import { WhatsappModule } from 'src/auth/channels/whatsapp/whatsapp.module';
import { UserEventModule } from 'src/user-event/user-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPhone, User]),
    forwardRef(() => AuthModule),
    RedisModule,
    TelegramModule,
    WhatsappModule,
    UserEventModule,
  ],
  controllers: [UserPhonesController],
  providers: [UserPhonesService],
  exports: [UserPhonesService],
})
export class UserPhonesModule {}
