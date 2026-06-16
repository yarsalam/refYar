import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UserPhase } from './entities/user-phase.entity';
import { UserMetricsService } from '../user-metrics/user-metrics.service';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { FeatureStoreService } from 'src/feature-store/feature-store.service';
import { User } from 'src/users/entities/user.entity';
import { UserEventLogs } from 'src/user-event/entities/user-event.entity';
import { Interaction } from 'src/interaction/entities/interaction.entity';
import { Message } from 'src/message/entities/message.entity';

const WEIGHT_TTL = 86400 * 90; // 90 روز

export interface PhaseWeights {
  matches: number;
  messages: number;
  views: number;
  retentionDays: number;
  pastPayments: number;
  boostUsed: number;
  cityUsers: number;
  learningScore: number;
  profileCompleteness: number;
  sentimentScore: number;
}

const DEFAULT_WEIGHTS: PhaseWeights = {
  matches: 2.5,
  messages: 2.0,
  views: 0.3,
  retentionDays: 1.5,
  pastPayments: 3.0,
  boostUsed: 1.0,
  cityUsers: 5.0,
  learningScore: 4.0,
  profileCompleteness: 4.0,
  sentimentScore: 2.0,
};

@Injectable()
export class PhaseService {
  private readonly logger = new Logger(PhaseService.name);

  constructor(
    @InjectRepository(UserPhase)
    private readonly repo: Repository<UserPhase>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(UserEventLogs)
    private readonly eventRepo: Repository<UserEventLogs>,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    @InjectRepository(Interaction)
    private readonly interactionRepo: Repository<Interaction>,

    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    private readonly metricsService: UserMetricsService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  // ── وزن‌های داینامیک ─────────────────────────────────────────────────────

  async getWeight(key: keyof PhaseWeights): Promise<number> {
    const stored = await this.redis.get(`phase:weight:${key}`);
    return stored ? parseFloat(stored) : DEFAULT_WEIGHTS[key];
  }

  async setWeight(key: keyof PhaseWeights, value: number): Promise<void> {
    // مقدار به صورت string + TTL برای جلوگیری از انباشت
    await this.redis.set(
      `phase:weight:${key}`,
      value.toString(),
      'EX',
      WEIGHT_TTL,
    );
  }

  async getAllWeights(): Promise<PhaseWeights> {
    const keys = Object.keys(DEFAULT_WEIGHTS) as (keyof PhaseWeights)[];
    const values = await Promise.all(keys.map((k) => this.getWeight(k)));
    const partial = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    // return Object.fromEntries(
    //   keys.map((k, i) => [k, values[i]]),
    // ) as PhaseWeights;
    return { ...DEFAULT_WEIGHTS, ...partial };
  }

  // ── محاسبه Learning Score ─────────────────────────────────────────────────

  async calculateLearningScore(userId: number): Promise<number> {
    const [events, interactions, messages] = await Promise.all([
      this.eventRepo.find({ where: { userId }, take: 100 }),
      // مستقیم از Repository — بدون چرخه به InteractionsService
      this.interactionRepo.find({
        where: { sender: { id: userId } },
        take: 500,
      }),
      // مستقیم از Repository — بدون چرخه به MessageService
      this.messageRepo.find({
        where: { from_id: userId },
        order: { created_at: 'DESC' },
        take: 200,
        select: ['content'],
      }),
    ]);

    // تنوع ویژگی‌های استفاده‌شده
    const usedFeatures = new Set(events.map((e) => e.type));
    const featureDiversity = Math.min(usedFeatures.size / 10, 1) * 100;

    // نرخ تبدیل Like به Match
    const likes = interactions.filter((i) => i.type === 'like').length;
    const matches = interactions.filter((i) => i.type === 'match').length;
    const likeToMatchRate = likes > 0 ? (matches / likes) * 100 : 0;

    // عمق مکالمه
    const totalLength = messages.reduce(
      (sum, m) => sum + (m.content?.length ?? 0),
      0,
    );
    const avgLength = messages.length > 0 ? totalLength / messages.length : 0;
    const messageDepth = Math.min((avgLength / 100) * 100, 100);

    // GuidanceGeneratorService حذف شد — مقدار hardcode به Redis منتقل می‌شود در آینده
    const guidanceCompletion = 0.7;
    const slope = await this.metricsService.getEngagementSlope(userId);

    const learningScore =
      featureDiversity * 0.25 +
      likeToMatchRate * 0.25 +
      messageDepth * 0.2 +
      guidanceCompletion * 0.2 +
      slope * 0.1;

    return Math.round(learningScore * 100) / 100;
  }

  // ── محاسبه فاز اصلی ──────────────────────────────────────────────────────

  async calculate(userId: number, metrics?: any): Promise<UserPhase> {
    try {
      const baseMetrics =
        metrics || (await this.metricsService.get7dMetrics(userId));
      const [weights, learningScore, profileCompleteness, sentimentScore] =
        await Promise.all([
          this.getAllWeights(),
          this.calculateLearningScore(userId),
          this.getProfileCompleteness(userId),
          this.getSentimentScore(userId),
        ]);

      const qualityMultiplier = this.calculateQualityMultiplier(baseMetrics);
      const effectiveMatches =
        (baseMetrics.matches7d || 0) * qualityMultiplier.likeQuality;
      const effectiveMessages =
        (baseMetrics.messages7d || 0) * qualityMultiplier.messageQuality;

      const score =
        (effectiveMatches || 0) * (weights.matches || 0) +
        (effectiveMessages || 0) * (weights.messages || 0) +
        (baseMetrics.views7d || 0) * (weights.views || 0) +
        (baseMetrics.retentionDays || 0) * (weights.retentionDays || 0) +
        Math.log2((baseMetrics.pastPayments || 0) + 1) *
          (weights.pastPayments || 0) +
        (baseMetrics.boostUsed7d || 0) * (weights.boostUsed || 0) +
        ((baseMetrics.cityUsers || 0) > 100 ? weights.cityUsers || 0 : 0) +
        (learningScore || 0) * (weights.learningScore || 0) +
        (profileCompleteness || 0) * (weights.profileCompleteness || 0) +
        (sentimentScore || 0) * (weights.sentimentScore || 0);

      const safeScore = isNaN(score) || !isFinite(score) ? 10 : score;

      let phase: string = 'cold';
      if (safeScore >= 40) phase = 'hot';
      else if (safeScore >= 15) phase = 'warm';

      let record = await this.repo.findOne({ where: { userId } });
      if (!record) record = this.repo.create({ userId });

      record.score = safeScore;
      record.phase = phase;
      record.learningScore = learningScore || 0;
      record.everPaid = (baseMetrics.pastPayments || 0) > 0;

      return this.repo.save(record);
    } catch (error) {
      this.logger.error(
        `Phase calculation failed for user ${userId}: ${error.message}`,
      );
      const fallback = await this.repo.findOne({ where: { userId } });
      if (!fallback) {
        return this.repo.save(
          this.repo.create({
            userId,
            phase: 'cold',
            score: 10,
            learningScore: 0,
            everPaid: false,
          }),
        );
      }
      return fallback;
    }
  }

  private calculateQualityMultiplier(metrics: any): {
    likeQuality: number;
    messageQuality: number;
  } {
    const likeQuality =
      metrics.matches7d > 0
        ? Math.min(metrics.matches7d / (metrics.likes7d || 1), 1)
        : 0.5;
    const messageQuality =
      metrics.messages7d > 0
        ? Math.min(metrics.receivedMessages7d / (metrics.messages7d || 1), 1)
        : 0.5;
    return { likeQuality, messageQuality };
  }

  // ── یادگیری تقویتی ──────────────────────────────────────────────────────

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
  ) {
    const rewardMap: Record<string, number> = {
      purchase: 2,
      match: 0.5,
      message: 0.3,
      boost_used: 0.4,
      churn: -1,
      profile_completed: 1.5,
    };

    const targetWeightMap: Record<string, keyof PhaseWeights> = {
      purchase: 'pastPayments',
      match: 'matches',
      message: 'messages',
      boost_used: 'boostUsed',
      churn: 'retentionDays',
      profile_completed: 'profileCompleteness',
    };

    if (event === 'churn') {
      // revenueAttribution حذف شد — source weight با Redis مستقیم آپدیت می‌شود
      const user = await this.userRepo.findOneBy({ id: userId });
      if (user) {
        const source = user.metadata?.acquisitionSource || 'organic';
        const currentRaw = await this.redis.get(`revenue:source:${source}`);
        const current = currentRaw ? parseFloat(currentRaw) : 1.0;
        const newWeight = Math.max(0.1, current + 0.01 * -0.5);
        await this.redis.set(`revenue:source:${source}`, newWeight.toString());
      }
    }

    const baseReward = rewardMap[event] ?? 0;
    const reward =
      context?.amount && context.amount > 100 ? baseReward * 1.5 : baseReward;
    const targetWeight = targetWeightMap[event];
    if (!targetWeight || reward === 0) return;

    const currentWeight = await this.getWeight(targetWeight);
    const learningRate = 0.01;
    const newWeight = Math.max(
      0.1,
      Math.min(10, currentWeight + learningRate * reward),
    );

    await this.setWeight(targetWeight, newWeight);

    if (['purchase', 'match', 'message', 'profile_completed'].includes(event)) {
      await this.featureStore.learnFeatureWeights(userId, event as any);
    }

    this.logger.log(
      `Weight "${targetWeight}" adjusted: ${currentWeight.toFixed(2)} → ${newWeight.toFixed(2)} (event: ${event})`,
    );

    await this.calculate(userId);
  }

  // ── متدهای کمکی ─────────────────────────────────────────────────────────

  private async getProfileCompleteness(userId: number): Promise<number> {
    return 0.7; // TODO: از ProblemDetectorService
  }

  private async getSentimentScore(userId: number): Promise<number> {
    return 0.5; // TODO: از PersonalityService
  }

  async get(userId: number): Promise<UserPhase> {
    let record = await this.repo.findOne({ where: { userId } });
    if (!record) {
      record = this.repo.create({ userId });
      await this.repo.save(record);
    }
    return record;
  }

  async markEverPaid(userId: number) {
    let record = await this.repo.findOne({ where: { userId } });
    if (!record) record = this.repo.create({ userId });
    record.everPaid = true;
    return this.repo.save(record);
  }

  async getPhaseMetrics(userId: number) {
    const phase = await this.get(userId);
    return {
      phase: phase.phase,
      score: phase.score,
      learningScore: phase.learningScore,
      everPaid: phase.everPaid,
      percentile: await this.calculatePercentile(phase.score),
      nextPhaseThreshold: this.getNextPhaseThreshold(phase.phase),
      suggestedActions: this.getSuggestedActions(phase.phase, phase.everPaid),
    };
  }

  private async calculatePercentile(score: number): Promise<number> {
    const total = await this.repo.count();
    if (total === 0) return 0;
    const less = await this.repo.count({ where: { score: LessThan(score) } });
    return Math.round((less / total) * 100);
  }

  private getNextPhaseThreshold(currentPhase: string): number {
    return currentPhase === 'cold' ? 15 : currentPhase === 'warm' ? 40 : 0;
  }

  private getSuggestedActions(phase: string, everPaid: boolean): string[] {
    const actions: string[] = [];
    switch (phase) {
      case 'cold':
        actions.push(
          'پروفایل خود را کامل کنید',
          'از بوست رایگان استفاده کنید',
          'عکس پروفایل باکیفیت آپلود کنید',
        );
        break;
      case 'warm':
        actions.push('برای شروع گفتگو اعتبار بخرید', 'با بوست بیشتر دیده شوید');
        if (!everPaid) actions.push('اولین خرید با تخفیف ویژه');
        break;
      case 'hot':
        actions.push(
          'VIP شوید و لایک نامحدود داشته باشید',
          'سوپرلایک روزانه رایگان',
        );
        break;
    }
    return actions;
  }

  async getPhaseDistribution() {
    const total = await this.repo.count();
    if (total === 0) return { cold: 0, warm: 0, hot: 0 };

    const [cold, warm, hot] = await Promise.all([
      this.repo.count({ where: { phase: 'cold' } }),
      this.repo.count({ where: { phase: 'warm' } }),
      this.repo.count({ where: { phase: 'hot' } }),
    ]);

    return {
      cold: Math.round((cold / total) * 100),
      warm: Math.round((warm / total) * 100),
      hot: Math.round((hot / total) * 100),
    };
  }
}
