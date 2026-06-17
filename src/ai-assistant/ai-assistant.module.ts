import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';

import { PhaseModule } from '../phase/phase.module';
import { AiImageModule } from '../ai-image/ai-image.module';
import { ProfileVisitorsModule } from '../profile-visitors/profile-visitors.module';
import { UserMetricsModule } from '../user-metrics/user-metrics.module';
import { PersonalityModule } from '../personality/personality.module';
import { FeedModule } from '../feed/feed.module';
import { AiSupportModule } from '../ai-support/ai-support.module';
import { UserEventModule } from '../user-event/user-event.module';
import { PaymentsModule } from '../payments/payments.module';
import { InteractionsModule } from 'src/interaction/interaction.module';
import { RelationStatusModule } from 'src/relation-status/relation-status.module';

import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AssistantConversation } from './entities/assistant-conversation.entity';
import { AssistantMessage } from './entities/assistant-message.entity';

import { ProblemDetectorService } from './analyzers/problem-detector.service';
import { GuidanceGeneratorService } from './guidance/guidance-generator.service';
import { PhaseOptimizerService } from './optimizers/phase-optimizer.service';
import { AssistantClientService } from './assistant-client.service';

import { ProfileVisitorsService } from 'src/profile-visitors/profile-visitors.service';
import { TicketService } from 'src/ai-support/services/ticket.service';
import { ProfileVisitor } from 'src/profile-visitors/entities/profile-visitor.entity';
import { User } from 'src/users/entities/user.entity';
import { SupportTicket } from 'src/ai-support/entities/ticket.entity';
import { TicketFeedback } from 'src/ai-support/entities/ticket-feedback.entity';
import { TicketMessage } from 'src/ai-support/entities/ticket-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssistantConversation,
      AssistantMessage,
      ProfileVisitor,
      SupportTicket,
      TicketFeedback,
      TicketMessage,
      User,
    ]),
    BullModule.registerQueue({ name: 'ai-support' }, { name: 'phase-check' }),
    RelationStatusModule,
    HttpModule,
    PhaseModule,
    AiImageModule,
    InteractionsModule,
    ProfileVisitorsModule,
    UserMetricsModule,
    PersonalityModule,
    FeedModule,
    AiSupportModule,
    UserEventModule,
    PaymentsModule,
  ],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    ProblemDetectorService,
    GuidanceGeneratorService,
    PhaseOptimizerService,
    AssistantClientService,
    ProfileVisitorsService,
    TicketService,
  ],
  exports: [AiAssistantService, GuidanceGeneratorService],
})
export class AiAssistantModule {}
