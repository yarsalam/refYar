import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UsersModule } from '../users/users.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { SEOModule } from '../seo/seo.module';
import { RevenueModule } from '../revenue/revenue.module';
import { PaymentsModule } from '../payments/payments.module'; // اضافه شد
import { PhaseModule } from '../phase/phase.module'; // اضافه شد (در صورت نیاز)

import { AdminApiGuard } from './guards/api-key.guard';
import { AdminApiController } from './controllers/users/admin-api.controller';
import { AdminApiAssistantController } from './controllers/assistant/admin-api-assistant.controller';
import { AdminApiSeoController } from './controllers/seo/admin-api-seo.controller';

// کنترلرهای جدید
import { AdminApiPaymentsController } from './controllers/payments/admin-api-payments.controller';
import { AdminApiPhaseController } from './controllers/phase/admin-api-phase.controller';
import { AdminApiRevenueController } from './controllers/revenue/admin-api-revenue.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { SafetyUsersController } from './controllers/safety/safety-users.controller';
import { SafetyTicketsController } from './controllers/safety/safety-tickets.controller';
import { SafetyReportsController } from './controllers/safety/safety-reports.controller';
import { SafetyModerationController } from './controllers/safety/safety-moderation.controller';
import { ReportBlockModule } from 'src/report-block/report-block.module';
import { AiSupportModule } from 'src/ai-support/ai-support.module';
import { CampaignsController } from './controllers/growth/campaigns.controller';
import { SeoStudioController } from './controllers/growth/seo-studio.controller';
import { SocialController } from './controllers/growth/social.controller';
import { MonetizationController } from './controllers/growth/monetization.controller';
import { SocialListenerModule } from 'src/social-listener/social-listener.module';
import { FeedModule } from 'src/feed/feed.module';
import { FeatureStoreModule } from 'src/feature-store/feature-store.module';
import { SuggestionModule } from 'src/suggestion/suggestion.module';
import { ProductModule } from 'src/product/product.module';
import { AiFeedbackModule } from 'src/ai-feedback/ai-feedback.module';
import { FeedSimulatorController } from './controllers/product/feed-simulator.controller';
import { AlgorithmTuningController } from './controllers/product/algorithm-tuning.controller';
import { FeedbackController } from './controllers/product/feedback.controller';
import { BundlesController } from './controllers/product/bundles.controller';
import { ExperimentsController } from './controllers/product/experiments.controller';
import { UserBoost } from 'src/payments/boosts/entities/user-boost.entity';
import { UserVip } from 'src/payments/vip/entities/vip.entity';
import { UserCredits } from 'src/payments/credits/entities/user-credits.entity';
import { Report } from 'src/report-block/entities/report.entity';
import { ModerationLog } from 'src/moderation/entities/moderation-log.entity';
import { ProfileVisitor } from 'src/profile-visitors/entities/profile-visitor.entity';
import { Interaction } from 'src/interaction/entities/interaction.entity';
import { Message } from 'src/message/entities/message.entity';
import { UserImage } from 'src/user_images/entities/user_image.entity';
import { Block } from 'src/report-block/entities/block.entity';
import { CampaignSEOService } from 'src/seo/services/campaign-seo.service';
import { SEOActivity } from 'src/seo/entities/seo-activity.entity';
import { SEOMetrics } from 'src/seo/entities/seo-metrics.entity';
import { FeatureStoreRevenueService } from 'src/feature-store-rvenue/feature-store-rvenue.service';
import { PartitionedEvent } from 'src/user-event/entities/partitioned-event.entity';
import { SERPFeatureHunterService } from 'src/seo/services/serp-feature-hunter.service';
import { CompetitorSEOService } from 'src/seo/services/competitor-seo.service';
import { CompetitorData } from 'src/seo/entities/competitor-data.entity';
import { BrandSentimentService } from 'src/seo/services/brand-sentiment.service';
import { DiversityOptimizerService } from 'src/suggestion/optimization/diversity-optimizer.service';
import { ConversionAnalyticsService } from 'src/ai-feedback/services/conversion-analytics.service';
import { AiFeedback } from 'src/ai-feedback/entities/ai-feedback.entity';
import { ProductService } from 'src/product/product.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Payment,
      UserBoost,
      UserVip,
      UserCredits,
      Report,
      ModerationLog,
      ProfileVisitor,
      Interaction,
      Message,
      UserImage,
      Block,
      SEOActivity,
      SEOMetrics,
      PartitionedEvent,
      CompetitorData,
      AiFeedback,
    ]),
    UsersModule,
    AiAssistantModule,
    SEOModule,
    RevenueModule,
    PaymentsModule,
    HttpModule,
    ConfigModule,
    AiSupportModule,
    ReportBlockModule,
    RevenueModule,
    SocialListenerModule,
    FeedModule,
    PhaseModule,
    FeatureStoreModule,
    SuggestionModule,
    ProductModule,
    AiFeedbackModule,
    HttpModule,
  ],
  controllers: [
    AdminApiController,
    AdminApiAssistantController,
    AdminApiSeoController,
    AdminApiPaymentsController,
    AdminApiPhaseController,
    AdminApiRevenueController,
    SafetyUsersController,
    SafetyTicketsController,
    SafetyReportsController,
    SafetyModerationController,
    CampaignsController,
    SeoStudioController,
    SocialController,
    MonetizationController,
    FeedSimulatorController,
    AlgorithmTuningController,
    FeedbackController,
    BundlesController,
    ExperimentsController,
  ],
  providers: [
    AdminApiGuard,
    CampaignSEOService,
    FeatureStoreRevenueService,
    SERPFeatureHunterService,
    CompetitorSEOService,
    BrandSentimentService,
    DiversityOptimizerService,
    ConversionAnalyticsService,
    ProductService,
  ],
})
export class AdminApiModule {}
