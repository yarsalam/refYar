import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/entities/payment.entity';
import { UserEventLogs } from '../user-event/entities/user-event.entity';
import { FeatureStoreRevenueService } from './feature-store-rvenue.service';
import { User } from 'src/users/entities/user.entity';
import { SEOActivity } from 'src/seo/entities/seo-activity.entity';
import { ExternalSEOToolsService } from 'src/seo/services/external-seo-tools.service';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from '@nestjs-modules/ioredis';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Payment, UserEventLogs, SEOActivity]),
    HttpModule,
    RedisModule,
  ],
  providers: [FeatureStoreRevenueService, ExternalSEOToolsService],
  exports: [FeatureStoreRevenueService],
})
export class FeatureStoreRevenueModule {}
