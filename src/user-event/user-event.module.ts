import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { UserEventService } from './user-event.service';
import { ArchiveController } from './user-event.controller';
import { ArchiveAdvisorService } from './services/archive-advisor.service';

import { PartitionedEvent } from './entities/partitioned-event.entity';
import { ArchiveRequest } from './entities/archive-request.entity';
import { AiFeedback } from 'src/ai-feedback/entities/ai-feedback.entity';
import { DailyEventAggregate } from './aggregates/daily-event-aggregate.entity';
import { UserCohort } from './aggregates/user-cohort.entity';

import { EventAggregatorProcessor } from './processors/event-aggregator.processor';
import { CohortCalculatorProcessor } from './processors/cohort-calculator.processor';

import { QueuesModule } from 'src/queues/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartitionedEvent,
      ArchiveRequest,
      AiFeedback,
      DailyEventAggregate,
      UserCohort,
    ]),
    BullModule.registerQueue(
      { name: 'event-ingestion' },
      { name: 'event-aggregation' },
      { name: 'cohort-calculation' },
      { name: 'ai-jobs' },
    ),

    QueuesModule,
  ],

  controllers: [ArchiveController],

  providers: [
    UserEventService,
    ArchiveAdvisorService,
    EventAggregatorProcessor,
    CohortCalculatorProcessor,
  ],

  exports: [UserEventService],
})
export class UserEventModule {}
