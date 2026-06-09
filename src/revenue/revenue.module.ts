import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { User } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SEOActivity } from '../seo/entities/seo-activity.entity';
import { UserEventLogs } from '../user-event/entities/user-event.entity';
import { RevenueIntelligenceService } from './revenue-intelligence.service';
import { RevenueIntelligenceProcessor } from './revenue-intelligence.processor';
import { DecisionEngineService } from './decision-engine.service';
import { RedisModule } from '../redis/redis.module';
import { QueuesModule } from '../queues/queues.module';
import { SEOModule } from '../seo/seo.module';
import { FeatureStoreRevenueModule } from '../feature-store-rvenue/feature-store-rvenue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Payment, SEOActivity, UserEventLogs]),
    forwardRef(() => SEOModule),
    QueuesModule,
    RedisModule,
    FeatureStoreRevenueModule,
    BullModule.registerQueue(
      { name: 'revenue-intelligence' },
      { name: 'ml-predictions' },
    ),
  ],

  providers: [
    RevenueIntelligenceService,
    DecisionEngineService,
    RevenueIntelligenceProcessor,
    RevenueIntelligenceService,
  ],

  exports: [RevenueIntelligenceService, DecisionEngineService],
})
export class RevenueModule {}
