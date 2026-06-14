import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class MetricsRefreshService {
  private readonly logger = new Logger(MetricsRefreshService.name);

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @Cron('0 3 * * *') // هر شب ساعت ۳ صبح
  async refreshDailyMetrics() {
    this.logger.log('Starting daily metrics refresh...');

    try {
      await this.entityManager.query(`
        REFRESH MATERIALIZED VIEW CONCURRENTLY user_daily_metrics;
      `);
      this.logger.log('Daily metrics refreshed successfully');
    } catch (error: unknown) {
      this.logger.error('Failed to refresh daily metrics', error);
    }
  }
}
