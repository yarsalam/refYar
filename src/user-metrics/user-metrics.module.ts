import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule'; // برای Cron
import { UserEventLogs } from '../user-event/entities/user-event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { UserEventModule } from '../user-event/user-event.module';

// سرویس‌ها
import { UserMetricsService } from './user-metrics.service';
import { FeatureService } from './feature.service';
import { DailyMetricsService } from './daily-metrics.service';
import { MetricsRefreshService } from './metrics-refresh.service';
import { PartitionedEvent } from 'src/user-event/entities/partitioned-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEventLogs, Payment, User, PartitionedEvent]), // ✅ همه entityها اینجا
    ScheduleModule.forRoot(), // برای Cron
    UserEventModule,
  ],
  providers: [
    UserMetricsService,
    FeatureService,
    DailyMetricsService,
    MetricsRefreshService,
  ],
  exports: [
    UserMetricsService,
    FeatureService, // ✅ هر دو رو export کن
  ],
})
export class UserMetricsModule {}
