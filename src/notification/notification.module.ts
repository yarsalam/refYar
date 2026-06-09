import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppNotification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationOrchestrator } from './orchestrator.notification';
import { PushChannel } from './channels/push.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { SmsChannel } from './channels/sms.channel';
import { EmailChannel } from './channels/email.channel';

@Module({
  imports: [TypeOrmModule.forFeature([AppNotification])],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationGateway,
    NotificationOrchestrator,
    PushChannel,
    TelegramChannel,
    SmsChannel,
    EmailChannel,
  ],
  exports: [NotificationService, NotificationOrchestrator],
})
export class NotificationModule {}
