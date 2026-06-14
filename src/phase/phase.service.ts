import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPhase } from './entities/user-phase.entity';
import { PhaseWeightService } from './services/phase-weight.service';
import { PhaseResolver } from './calculators/phase.resolver';
import { PhaseLearningService } from './services/phase-learning.service';
import { PhaseMetricsService } from './services/phase-metrics.service';
import { PhaseWeights } from './types/phase.interface';

@Injectable()
export class PhaseService {
  private readonly logger = new Logger(PhaseService.name);

  constructor(
    @InjectRepository(UserPhase)
    private readonly repo: Repository<UserPhase>,
    private readonly weightService: PhaseWeightService,
    private readonly resolver: PhaseResolver,
    private readonly learningService: PhaseLearningService,
    private readonly metricsService: PhaseMetricsService,
  ) {}

  // وزن‌ها
  async getWeight(key: keyof PhaseWeights): Promise<number> {
    return this.weightService.getWeight(key);
  }

  async setWeight(key: keyof PhaseWeights, value: number): Promise<void> {
    return this.weightService.setWeight(key, value);
  }

  async getAllWeights(): Promise<PhaseWeights> {
    return this.weightService.getAllWeights();
  }

  // محاسبه فاز
  async calculate(userId: number, metrics?: any): Promise<UserPhase> {
    return this.resolver.calculate(userId, metrics);
  }

  // یادگیری تقویتی
  async learnFromFeedback(
    userId: number,
    event:
      | 'purchase'
      | 'match'
      | 'message'
      | 'boost_used'
      | 'churn'
      | 'profile_completed',
    context?: { amount?: number; productType?: string },
  ): Promise<void> {
    return this.learningService.learnFromFeedback(userId, event, context);
  }

  // گرفتن یا ایجاد رکورد فاز
  async get(userId: number): Promise<UserPhase> {
    let record = await this.repo.findOne({ where: { userId } });
    if (!record) {
      record = this.repo.create({ userId });
      await this.repo.save(record);
    }
    return record;
  }

  async markEverPaid(userId: number): Promise<UserPhase> {
    let record = await this.repo.findOne({ where: { userId } });
    if (!record) record = this.repo.create({ userId });
    record.everPaid = true;
    return this.repo.save(record);
  }

  // متدهای متریک و گزارش
  async getPhaseMetrics(userId: number): Promise<any> {
    return this.metricsService.getPhaseMetrics(userId);
  }

  async getPhaseDistribution(): Promise<{
    cold: number;
    warm: number;
    hot: number;
  }> {
    return this.metricsService.getPhaseDistribution();
  }

  // متدهایی که در کنترلر استفاده می‌شود (اگر قبلاً وجود داشته)
  async getPhase(userId: number) {
    return this.getPhaseMetrics(userId);
  }
}
