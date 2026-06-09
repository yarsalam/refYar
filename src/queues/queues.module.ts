import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiJobProcessor } from './workers/ai-job.processor';
import { OpsAlertsProcessor } from './workers/ops-alerts.processor';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST') ?? 'localhost',
          port: config.get('REDIS_PORT') ?? 6379,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'ai-jobs' },
      { name: 'ai-feedback' },
      { name: 'conversion-analysis' },
      { name: 'event-ingestion' },
      { name: 'event-aggregation' },
      { name: 'cohort-calculation' },
      { name: 'ops-alerts' },
      { name: 'ml-training' },
      { name: 'notifications' }, // رفع: اضافه شد
      { name: 'phase-check' }, // رفع: برای PhaseOptimizerService
    ),
    NotificationModule,
  ],
  providers: [AiJobProcessor, OpsAlertsProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
