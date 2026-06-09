import { forwardRef, Module } from '@nestjs/common';
import { PhaseService } from './phase.service';
import { PhaseRecalcService } from './phase-recalc.service';
import { PhaseOptimizerService } from './phase-optimizer.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPhase } from './entities/user-phase.entity';
import { User } from 'src/users/entities/user.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { UserMetricsModule } from '../user-metrics/user-metrics.module';
import { InteractionsModule } from '../interaction/interaction.module';
import { MessageModule } from '../message/message.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { RedisModule } from '../redis/redis.module';
import { UserEventLogs } from 'src/user-event/entities/user-event.entity';
import { FeatureStoreModule } from 'src/feature-store/feature-store.module';
import { SEOModule } from 'src/seo/seo.module';
import { PhaseController } from './phase.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPhase, User, Payment, UserEventLogs]),
    forwardRef(() => InteractionsModule),
    forwardRef(() => SEOModule),
    UserMetricsModule,
    MessageModule,
    AiAssistantModule,
    RedisModule,
    FeatureStoreModule,
  ],
  providers: [PhaseService, PhaseRecalcService, PhaseOptimizerService],
  exports: [PhaseService],
  controllers: [PhaseController],
})
export class PhaseModule {}
