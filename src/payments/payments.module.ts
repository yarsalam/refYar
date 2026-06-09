import { forwardRef, Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CreditsModule } from './credits/credits.module';
import { BoostsModule } from './boosts/boosts.module';
import { PhaseModule } from '../phase/phase.module';
import { PaywallModule } from './paywall/paywall.module';
import { VipModule } from './vip/vip.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEventModule } from 'src/user-event/user-event.module';
import { ProductBundle } from 'src/product/entities/product-bundle.entity';
import { PromotionExposureService } from './promotion-exposure.service';
import { PromotionEngineService } from './promotion-engine.service';
import { RedisModule } from 'src/redis/redis.module';
import { HttpModule } from '@nestjs/axios';
import { UserMetricsModule } from 'src/user-metrics/user-metrics.module';
import { SuggestionModule } from 'src/suggestion/suggestion.module';
import { User } from 'src/users/entities/user.entity';
import { AiFeedbackModule } from 'src/ai-feedback/ai-feedback.module';
import { FeatureStoreModule } from 'src/feature-store/feature-store.module';
import { SEOModule } from 'src/seo/seo.module';
import { UserVip } from './vip/entities/vip.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductBundle, User, UserVip]),
    forwardRef(() => PhaseModule),
    forwardRef(() => SEOModule),
    CreditsModule,
    BoostsModule,
    PaywallModule,
    VipModule,
    UserEventModule,
    RedisModule,
    UserMetricsModule,
    HttpModule,
    SuggestionModule,
    AiFeedbackModule,
    FeatureStoreModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PromotionExposureService,
    PromotionEngineService,
  ],
  exports: [PromotionExposureService, PromotionEngineService, PaymentsService],
})
export class PaymentsModule {}
