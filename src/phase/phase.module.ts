import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPhase } from './entities/user-phase.entity';
import { User } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { UserEventLogs } from '../user-event/entities/user-event.entity';
import { Message } from '../message/entities/message.entity';
import { UserMetricsModule } from '../user-metrics/user-metrics.module';
import { InteractionsModule } from '../interaction/interaction.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { RedisModule } from '../redis/redis.module';
import { FeatureStoreModule } from '../feature-store/feature-store.module';
import { SEOModule } from '../seo/seo.module';

import { PhaseController } from './phase.controller';
import { PhaseService } from './phase.service';
import { PhaseWeightService } from './services/phase-weight.service';
import { PhaseResolver } from './calculators/phase.resolver';
import { PhaseLearningService } from './services/phase-learning.service';
import { PhaseMetricsService } from './services/phase-metrics.service';
import { EngagementScoreCalculator } from './calculators/engagement-score.calculator';
import { RevenueScoreCalculator } from './calculators/revenue-score.calculator';
import { ActivityScoreCalculator } from './calculators/activity-score.calculator';
import { VipScoreCalculator } from './calculators/vip-score.calculator';

// سرویس‌های کمکی دیگر که ممکن بود در فاز قبلی استفاده شوند (PhaseRecalcService, PhaseOptimizerService) را نیز نگه می‌داریم.
import { PhaseRecalcService } from './phase-recalc.service';
import { PhaseOptimizerService } from './phase-optimizer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserPhase,
      User,
      Payment,
      UserEventLogs,
      Message,
    ]),
    forwardRef(() => InteractionsModule),
    forwardRef(() => SEOModule),
    UserMetricsModule,
    AiAssistantModule,
    RedisModule,
    FeatureStoreModule,
  ],
  controllers: [PhaseController],
  providers: [
    PhaseService,
    PhaseWeightService,
    PhaseResolver,
    PhaseLearningService,
    PhaseMetricsService,
    EngagementScoreCalculator,
    RevenueScoreCalculator,
    ActivityScoreCalculator,
    VipScoreCalculator,
    PhaseRecalcService, // همان سرویس قبلی – بدون تغییر
    PhaseOptimizerService, // همان سرویس قبلی – بدون تغییر
  ],
  exports: [PhaseService], // فقط PhaseService برای استفاده بیرون
})
export class PhaseModule {}
