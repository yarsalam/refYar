import { Module } from '@nestjs/common';
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
import { FeatureStoreRevenueModule } from '../feature-store-rvenue/feature-store-rvenue.module';
import { RevenueAttributionService } from './revenue-attribution.service';
import { HttpModule } from '@nestjs/axios';
import { FeatureStoreModule } from 'src/feature-store/feature-store.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Payment, SEOActivity, UserEventLogs]),
    QueuesModule,
    RedisModule,
    FeatureStoreRevenueModule,
    FeatureStoreModule,
    HttpModule,
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
    RevenueAttributionService,
  ],

  exports: [
    RevenueIntelligenceService,
    DecisionEngineService,
    RevenueAttributionService,
  ],
})
export class RevenueModule {}
