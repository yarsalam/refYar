import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class DailyMetricsService {
  private readonly logger = new Logger(DailyMetricsService.name);

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @Cron('0 3 * * *') // هر شب ساعت ۳ صبح
  async updateDailyMetrics() {
    this.logger.log('Starting daily metrics update...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      await this.entityManager.query(
        `
        INSERT INTO user_daily_metrics (
          user_id, metric_date,
          app_opens, messages_sent, profile_views,
          likes, matches, boost_used, purchases
        )
        SELECT
          user_id,
          DATE(created_at) AS metric_date,
          SUM(CASE WHEN type IN ('login', 'app_open') THEN 1 ELSE 0 END) AS app_opens,
          SUM(CASE WHEN type = 'message_sent' THEN 1 ELSE 0 END)        AS messages_sent,
          SUM(CASE WHEN type = 'profile_view' THEN 1 ELSE 0 END)        AS profile_views,
          SUM(CASE WHEN type = 'like' THEN 1 ELSE 0 END)                AS likes,
          SUM(CASE WHEN type = 'match' THEN 1 ELSE 0 END)               AS matches,
          SUM(CASE WHEN type = 'boost_used' THEN 1 ELSE 0 END)          AS boost_used,
          SUM(CASE WHEN type = 'purchase' THEN 1 ELSE 0 END)            AS purchases
        FROM user_events
        WHERE DATE(created_at) = ?
        GROUP BY user_id, DATE(created_at)

        ON DUPLICATE KEY UPDATE
          app_opens      = VALUES(app_opens),
          messages_sent  = VALUES(messages_sent),
          profile_views  = VALUES(profile_views),
          likes          = VALUES(likes),
          matches        = VALUES(matches),
          boost_used     = VALUES(boost_used),
          purchases      = VALUES(purchases)
        `,
        [dateStr],
      );

      this.logger.log(`Daily metrics updated for ${dateStr}`);
    } catch (err: unknown) {
      this.logger.error('Failed to update daily metrics', err);
    }
  }
}
