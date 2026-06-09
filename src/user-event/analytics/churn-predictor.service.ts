import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { PartitionedEvent } from '../entities/partitioned-event.entity';
import { EventType } from '../entities/user-event.entity';

@Injectable()
export class ChurnPredictorService {
  private readonly logger = new Logger(ChurnPredictorService.name);

  constructor(
    @InjectRepository(PartitionedEvent)
    private readonly eventRepo: Repository<PartitionedEvent>,
  ) {}

  async predictChurnRisk(userId: number): Promise<number> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentEvents = await this.eventRepo.find({
      where: {
        userId,
        createdAt: MoreThan(sevenDaysAgo),
      },
    });

    if (recentEvents.length === 0) {
      return 0.9; // 90% churn risk
    }

    const likes = recentEvents.filter((e) => e.type === EventType.LIKE).length;
    const messages = recentEvents.filter(
      (e) => e.type === EventType.MESSAGE_SENT,
    ).length;
    const appOpens = recentEvents.filter(
      (e) => e.type === EventType.APP_OPEN,
    ).length;

    // فرمول ساده churn
    let risk = 0.5;

    if (appOpens < 3) risk += 0.2;
    if (likes < 2) risk += 0.15;
    if (messages === 0) risk += 0.2;

    return Math.min(1, risk);
  }

  async getAtRiskUsers(threshold: number = 0.7): Promise<number[]> {
    // TODO: از aggregate tables
    return [];
  }
}
