import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Payment } from 'src/payments/entities/payment.entity';
import { EventType } from 'src/user-event/entities/user-event.entity';
import { EntityManager, MoreThan, Repository } from 'typeorm';

import { PartitionedEvent } from 'src/user-event/entities/partitioned-event.entity';

@Injectable()
export class UserMetricsService {
  constructor(
    @InjectRepository(PartitionedEvent)
    private readonly activityRepo: Repository<PartitionedEvent>,

    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,

    private readonly entityManager: EntityManager,
  ) {}

  async get7dMetrics(userId: number) {
    // FIX: کوئری برای PostgreSQL بازنویسی شد.
    // تغییرات:
    //   1) placeholder ? → $1
    //   2) CURDATE() → CURRENT_DATE
    //   3) INTERVAL 7 DAY → INTERVAL '7 days'
    //   4) SELECT COUNT(*) → SELECT COUNT(*) AS cnt  (برای key قابل پیش‌بینی)
    const result = await this.entityManager.query(
      `
      SELECT
        COALESCE(SUM(app_opens),     0) AS app_opens,
        COALESCE(SUM(messages_sent), 0) AS messages7d,
        COALESCE(SUM(profile_views), 0) AS views7d,
        COALESCE(SUM(likes),         0) AS likes7d,
        COALESCE(SUM(matches),       0) AS matches7d,
        COALESCE(SUM(boost_used),    0) AS "boostUsed7d",
        COALESCE(SUM(purchases),     0) AS "purchases7d"
      FROM user_daily_metrics
      WHERE user_id = $1
        AND metric_date >= CURRENT_DATE - INTERVAL '7 days'
      `,
      [userId],
    );

    return (
      result[0] || {
        app_opens: 0,
        messages7d: 0,
        views7d: 0,
        likes7d: 0,
        matches7d: 0,
        boostUsed7d: 0,
        purchases7d: 0,
      }
    );
  }

  async getRetentionDays(userId: number): Promise<number> {
    // FIX: کوئری برای PostgreSQL بازنویسی شد.
    const result = await this.entityManager.query(
      `
      SELECT COUNT(*) AS retention_count
      FROM user_daily_metrics
      WHERE user_id = $1
        AND app_opens > 0
        AND metric_date >= CURRENT_DATE - INTERVAL '7 days'
      `,
      [userId],
    );

    // FIX: کلید نتیجه در PostgreSQL lowercase است → 'retention_count' نه 'COUNT(*)'
    return Number(result[0]?.['retention_count'] || 0);
  }

  async getBoostUsed7d(userId: number): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.activityRepo.count({
      where: {
        userId,
        type: EventType.BOOST_USED,
        createdAt: MoreThan(sevenDaysAgo),
      },
    });
  }

  async getMessagesSent7d(userId: number): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.activityRepo.count({
      where: {
        userId,
        type: EventType.MESSAGE_SENT,
        createdAt: MoreThan(sevenDaysAgo),
      },
    });
  }

  async getProfileViews7d(userId: number): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.activityRepo.count({
      where: {
        targetUserId: userId,
        type: EventType.PROFILE_VIEW,
        createdAt: MoreThan(sevenDaysAgo),
      },
    });
  }

  async getPastPayments(userId: number): Promise<number> {
    return this.paymentRepo.count({
      where: { userId, status: 'paid' },
    });
  }

  async buildExtraMetrics(userId: number) {
    const [retentionDays, boostUsed7d, pastPayments, messages7d, views7d] =
      await Promise.all([
        this.getRetentionDays(userId),
        this.getBoostUsed7d(userId),
        this.getPastPayments(userId),
        this.getMessagesSent7d(userId),
        this.getProfileViews7d(userId),
      ]);

    return { retentionDays, boostUsed7d, pastPayments, messages7d, views7d };
  }

  async getEngagementSlope(userId: number): Promise<number> {
    return 0.7; // TODO: implement real logic
  }
}
