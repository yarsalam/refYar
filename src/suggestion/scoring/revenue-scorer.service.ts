import { Injectable, Logger, Inject } from '@nestjs/common';
import { FeatureStoreService } from '../../feature-store/feature-store.service';
import { UserFeatureSnapshot } from 'src/feature-store/entities/user-feature.entity';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.constants';

export interface RevenueScore {
  userId: number;
  candidateId: number;
  expectedRevenue: number;
  components: {
    matchProb: number;
    responseProb: number;
    purchaseProb: number;
    ltv: number;
  };
  confidence: number;
}

@Injectable()
export class RevenueScorerService {
  private readonly logger = new Logger(RevenueScorerService.name);

  private readonly DEFAULT_PHASE_MULTIPLIERS = {
    cold_cold: 0.8,
    cold_warm: 0.9,
    cold_hot: 1.0,
    warm_cold: 0.7,
    warm_warm: 1.0,
    warm_hot: 1.1,
    hot_cold: 0.6,
    hot_warm: 1.0,
    hot_hot: 1.2,
  };

  constructor(
    private readonly featureStore: FeatureStoreService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async scoreBatch(
    userId: number,
    candidateIds: number[],
  ): Promise<RevenueScore[]> {
    if (candidateIds.length === 0) return [];

    // تبدیل userId و candidateIds به عدد (در صورت نیاز)
    const userIdNum = Number(userId);
    const candidateIdsNum = candidateIds.map((id) => Number(id));
    const allFeatures = await this.featureStore.getBatchFeatures([
      userIdNum,
      ...candidateIdsNum,
    ]);

    // نرمال‌سازی کلیدها به عدد
    const featuresMap = new Map<number, UserFeatureSnapshot>();
    for (const [key, value] of allFeatures.entries()) {
      const numKey = Number(key);
      if (!isNaN(numKey)) {
        featuresMap.set(numKey, value);
      }
    }

    const userFeatures = featuresMap.get(userIdNum);
    if (!userFeatures) {
      return [];
    }

    const scores: RevenueScore[] = [];

    for (const candidateId of candidateIdsNum) {
      const candidateFeatures = featuresMap.get(candidateId);
      if (!candidateFeatures) {
        continue;
      }

      const matchProb = await this.calculateMatchProbability(
        userFeatures,
        candidateFeatures,
      );
      const responseProb = this.calculateResponseProbability(candidateFeatures);
      const purchaseProb = this.calculatePurchaseProbability(candidateFeatures);
      const ltv = candidateFeatures.avgLTV ?? 0;
      const expectedRevenue = matchProb * responseProb * purchaseProb * ltv;
      const confidence = this.calculateConfidence(
        userFeatures,
        candidateFeatures,
      );

      scores.push({
        userId: userIdNum,
        candidateId,
        expectedRevenue,
        components: { matchProb, responseProb, purchaseProb, ltv },
        confidence,
      });
    }

    return scores.sort((a, b) => b.expectedRevenue - a.expectedRevenue);
  }

  private async calculateMatchProbability(
    user: UserFeatureSnapshot,
    candidate: UserFeatureSnapshot,
  ): Promise<number> {
    const similarity = this.cosineSimilarity(
      user.profileVector ?? [],
      candidate.profileVector ?? [],
    );

    const phaseMultiplier = await this.getPhaseMultiplier(
      user.phase,
      candidate.phase,
    );
    return similarity * phaseMultiplier;
  }

  private calculateResponseProbability(candidate: UserFeatureSnapshot): number {
    return candidate.responseProbability || 0.3;
  }

  private calculatePurchaseProbability(candidate: UserFeatureSnapshot): number {
    return candidate.purchaseProbability || 0.1;
  }

  private calculateConfidence(
    user: UserFeatureSnapshot,
    candidate: UserFeatureSnapshot,
  ): number {
    let confidence = 0.8;
    if (!user.profileVector || !candidate.profileVector) confidence -= 0.2;
    if (!user.behaviorVector || !candidate.behaviorVector) confidence -= 0.1;
    if (!user.personalityVector) confidence -= 0.1;
    return Math.max(0.4, confidence);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0.5;
    const dot = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return normA && normB ? dot / (normA * normB) : 0;
  }
  private async getPhaseMultiplier(
    userPhase: string,
    candidatePhase: string,
  ): Promise<number> {
    const key = `${userPhase}_${candidatePhase}`;
    const stored = await this.redis.get(`revenue:phase:${key}`);
    if (stored) return parseFloat(stored);
    const defaultValue = this.DEFAULT_PHASE_MULTIPLIERS[key] || 0.8;
    await this.redis.set(`revenue:phase:${key}`, defaultValue);
    return defaultValue;
  }

  async adjustPhaseMultiplier(
    userPhase: string,
    candidatePhase: string,
    reward: number,
  ): Promise<void> {
    const key = `${userPhase}_${candidatePhase}`;
    const current = await this.getPhaseMultiplier(userPhase, candidatePhase);

    const learningRate = 0.005;
    const newValue = Math.max(
      0.1,
      Math.min(2.0, current + learningRate * reward),
    );

    await this.redis.set(`revenue:phase:${key}`, newValue.toString());

    this.logger.log(
      `Phase multiplier "${key}" adjusted: ${current.toFixed(3)} → ${newValue.toFixed(3)} (reward: ${reward})`,
    );
  }
}
