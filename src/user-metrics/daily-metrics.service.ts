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
          DATE(created_at)                                           AS metric_date,
          COUNT(*) FILTER (WHERE type IN ('login', 'app_open'))     AS app_opens,
          COUNT(*) FILTER (WHERE type = 'message_sent')             AS messages_sent,
          COUNT(*) FILTER (WHERE type = 'profile_view')             AS profile_views,
          COUNT(*) FILTER (WHERE type = 'like')                     AS likes,
          COUNT(*) FILTER (WHERE type = 'match')                    AS matches,
          COUNT(*) FILTER (WHERE type = 'boost_used')               AS boost_used,
          COUNT(*) FILTER (WHERE type = 'purchase')                 AS purchases
        FROM user_events
        WHERE DATE(created_at) = $1
        GROUP BY user_id, DATE(created_at)

        ON CONFLICT (user_id, metric_date) DO UPDATE SET
          app_opens      = EXCLUDED.app_opens,
          messages_sent  = EXCLUDED.messages_sent,
          profile_views  = EXCLUDED.profile_views,
          likes          = EXCLUDED.likes,
          matches        = EXCLUDED.matches,
          boost_used     = EXCLUDED.boost_used,
          purchases      = EXCLUDED.purchases
        `,
        [dateStr],
      );

      this.logger.log(`Daily metrics updated for ${dateStr}`);
    } catch (err: unknown) {
      this.logger.error('Failed to update daily metrics', err);
    }
  }
}
