import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { PartitionedEvent } from '../entities/partitioned-event.entity';
import { DailyEventAggregate } from '../aggregates/daily-event-aggregate.entity';

@Processor('event-aggregation')
@Injectable()
export class EventAggregatorProcessor extends WorkerHost {
  private readonly logger = new Logger(EventAggregatorProcessor.name);

  constructor(
    @InjectRepository(PartitionedEvent)
    private readonly eventRepo: Repository<PartitionedEvent>,
    @InjectRepository(DailyEventAggregate)
    private readonly aggregateRepo: Repository<DailyEventAggregate>,
    private readonly entityManager: EntityManager,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { date } = job.data;
    const startTime = Date.now();

    this.logger.log(`Aggregating events for ${date}`);

    // FIX: aggregate داخل aggregate مجاز نیست در PostgreSQL.
    // قبلاً: jsonb_object_agg(platform, COUNT(*)) → خطای "nested aggregate"
    // حالا: با CTE اول COUNT ها محاسبه می‌شوند، سپس jsonb_object_agg روی آن اعمال می‌شود.
    const results = await this.entityManager.query(
      `
      WITH base AS (
        SELECT
          type,
          user_id,
          value,
          COALESCE(platform, 'unknown') AS platform,
          COALESCE(country,  'unknown') AS country
        FROM user_events
        WHERE DATE(created_at) = $1
      ),
      summary AS (
        SELECT
          type,
          COUNT(*)              AS total_count,
          COUNT(DISTINCT user_id) AS unique_users,
          COALESCE(SUM(value), 0) AS total_value
        FROM base
        GROUP BY type
      ),
      platform_agg AS (
        SELECT type, jsonb_object_agg(platform, cnt) AS by_platform
        FROM (
          SELECT type, platform, COUNT(*) AS cnt
          FROM base
          GROUP BY type, platform
        ) t
        GROUP BY type
      ),
      country_agg AS (
        SELECT type, jsonb_object_agg(country, cnt) AS by_country
        FROM (
          SELECT type, country, COUNT(*) AS cnt
          FROM base
          GROUP BY type, country
        ) t
        GROUP BY type
      )
      SELECT
        s.type,
        s.total_count    AS count,
        s.unique_users,
        s.total_value,
        COALESCE(pa.by_platform, '{}') AS by_platform,
        COALESCE(ca.by_country,  '{}') AS by_country
      FROM summary s
      LEFT JOIN platform_agg pa ON pa.type = s.type
      LEFT JOIN country_agg  ca ON ca.type = s.type
      `,
      [date],
    );

    if (results.length === 0) {
      this.logger.log(`No events for ${date}`);
      return { date, aggregated: 0 };
    }

    const aggregates = results.map((row) => ({
      date: new Date(date),
      eventType: row.type,
      totalCount: parseInt(row.count, 10),
      uniqueUsers: parseInt(row.unique_users, 10),
      totalValue: parseFloat(row.total_value),
      byPlatform: row.by_platform || {},
      byCountry: row.by_country || {},
    }));

    // Bulk upsert - کلید (date, eventType) از PrimaryColumn گرفته می‌شود
    await this.entityManager
      .createQueryBuilder()
      .insert()
      .into(DailyEventAggregate)
      .values(aggregates)
      .orUpdate(
        ['totalCount', 'uniqueUsers', 'totalValue', 'byPlatform', 'byCountry'],
        ['date', 'eventType'],
      )
      .execute();

    const duration = Date.now() - startTime;
    this.logger.log(
      `✅ Aggregated ${results.length} event types for ${date} in ${duration}ms`,
    );

    return { date, aggregated: results.length, duration };
  }
}
