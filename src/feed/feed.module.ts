import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { PhaseModule } from '../phase/phase.module';
import { SuggestionModule } from '../suggestion/suggestion.module';
import { UserEventModule } from '../user-event/user-event.module';
import { RedisModule } from '../redis/redis.module';
import { PaymentsModule } from '../payments/payments.module';
import { FeedBuilderService } from './feed.service';
import { FeedController } from './feed.controller';
import { SEOModule } from 'src/seo/seo.module';
import { VipModule } from 'src/payments/vip/vip.module';
import { CreditsModule } from 'src/payments/credits/credits.module';
import { RelationStatusModule } from 'src/relation-status/relation-status.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => PhaseModule),
    SuggestionModule,
    UserEventModule,
    RedisModule,
    PaymentsModule,
    SEOModule,
    VipModule,
    CreditsModule,
    RelationStatusModule,
  ],
  controllers: [FeedController],
  providers: [FeedBuilderService],
  exports: [FeedBuilderService],
})
export class FeedModule {}
