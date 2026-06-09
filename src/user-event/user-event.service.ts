import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { PartitionedEvent } from './entities/partitioned-event.entity';
import { LogEventDto } from './dto/log-event.dto';

@Injectable()
export class UserEventService {
  private readonly logger = new Logger(UserEventService.name);

  constructor(
    @InjectRepository(PartitionedEvent)
    private readonly eventRepo: Repository<PartitionedEvent>,

    @InjectQueue('event-ingestion')
    private readonly ingestionQueue: Queue,

    @InjectQueue('event-aggregation')
    private readonly aggregationQueue: Queue,

    @InjectQueue('cohort-calculation')
    private readonly cohortQueue: Queue,
  ) {}

  async log(eventData: LogEventDto): Promise<void> {
    // فقط ذخیره‌سازی سریع - بدون پردازش اضافه
    const event = this.eventRepo.create({
      userId: eventData.userId,
      targetUserId: eventData.targetUserId ?? undefined,
      type: eventData.type,
      sessionId: eventData.sessionId,
      metadata: eventData.metadata,
      value: eventData.value,
      currency: eventData.currency,
      duration: eventData.duration,
      platform: eventData.platform,
      country: eventData.country,
    });

    await this.eventRepo.save(event);

    // ارسال به صف برای پردازش‌های بعدی
    await this.ingestionQueue.add('process', {
      eventId: event.id,
      userId: event.userId,
      type: event.type,
    });
  }

  @Cron('0 1 * * *') // هر روز ساعت 1:30 بامداد
  async aggregateDaily() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    await this.aggregationQueue.add('aggregate-daily', {
      date: dateStr,
    });
  }

  @Cron('0 2 * * 0') // هر یکشنبه ساعت 2 بامداد
  async calculateCohorts() {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const dateStr = lastWeek.toISOString().split('T')[0];

    await this.cohortQueue.add('calculate-cohort', {
      cohortDate: dateStr,
    });
  }

  async getUserStats(userId: number): Promise<{
    totalEvents: number;
    activeDays: number;
    breakdown: any[];
    avgLTV: number;
    purchaseRate: number;
    responseRate: number;
    matchRate: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(DISTINCT DATE(e.createdAt))', 'activeDays')
      .where('e.userId = :userId', { userId })
      .andWhere('e.createdAt > :date', { date: thirtyDaysAgo })
      .groupBy('e.type')
      .getRawMany();

    return {
      totalEvents: stats.reduce((sum, s) => sum + parseInt(s.count), 0),
      activeDays: stats[0]?.activeDays || 0,
      breakdown: stats,
      avgLTV: 0,
      purchaseRate: 0,
      responseRate: 0,
      matchRate: 0,
    };
  }

  async getUserEvents(userId: number, options?: { limit?: number }) {
    return this.eventRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: options?.limit ?? 50,
    });
  }
}
