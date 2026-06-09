import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';

import { SupportTicket } from './entities/ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { TicketFeedback } from './entities/ticket-feedback.entity';
import { TicketService } from './services/ticket.service';
import { UserEventModule } from 'src/user-event/user-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, TicketMessage, TicketFeedback]),
    BullModule.registerQueue({ name: 'ai-support' }),
    HttpModule.register({ timeout: 5_000, maxRedirects: 3 }),
    UserEventModule,
  ],
  providers: [TicketService],
  exports: [TicketService],
})
export class AiSupportModule {}
