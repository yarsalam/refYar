import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/entities/payment.entity';
import { UserEventLogs } from '../user-event/entities/user-event.entity';
import { FeatureStoreRevenueService } from './feature-store-rvenue.service';
import { User } from 'src/users/entities/user.entity';
import { SEOActivity } from 'src/seo/entities/seo-activity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Payment, UserEventLogs, SEOActivity]),
  ],
  providers: [FeatureStoreRevenueService],
  exports: [FeatureStoreRevenueService],
})
export class FeatureStoreRevenueModule {}
