import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { UserFeatureSnapshot } from './entities/user-feature.entity';
import { UsersService } from '../users/users.service';
import { PersonalityService } from '../personality/personality.service';
import { UserEventService } from '../user-event/user-event.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.constants';

// کلید اختصاصی برای feature-store — جدا از revenue features
const CACHE_KEY_PREFIX = 'feature_snapshot';

const DEFAULT_PROFILE_WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const DEFAULT_BEHAVIOR_WEIGHTS = [1, 1, 1, 1, 1];
const DEFAULT_PERSONALITY_WEIGHTS = [1, 1, 1, 1, 1];

// حداکثر همزمانی برای جلوگیری از DB meltdown
const REFRESH_CONCURRENCY = 10;

@Injectable()
export class FeatureStoreService {
  private readonly logger = new Logger(FeatureStoreService.name);

  constructor(
    @InjectRepository(UserFeatureSnapshot)
    private readonly featureRepo: Repository<UserFeatureSnapshot>,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    private readonly personalityService: PersonalityService,
    private readonly userEventService: UserEventService,
  ) {}

  private cacheKey(userId: number): string {
    return `${CACHE_KEY_PREFIX}:${userId}`;
  }

  async getWeightArray(
    redisKey: string,
    defaults: number[],
  ): Promise<number[]> {
    const stored = await this.redis.get(redisKey);
    if (stored) return JSON.parse(stored);
    await this.redis.set(redisKey, JSON.stringify(defaults));
    return defaults;
  }

  async getUserFeatures(userId: number): Promise<UserFeatureSnapshot> {
    const cached = await this.redis.get(this.cacheKey(userId));
    if (cached) return JSON.parse(cached);

    const features = await this.featureRepo.findOne({ where: { userId } });
    if (!features) {
      throw new Error(`Feature snapshot not found for user ${userId}`);
    }

    await this.redis.set(
      this.cacheKey(userId),
      JSON.stringify(features),
      'EX',
      300,
    );
    return features;
  }

  async getBatchFeatures(
    userIds: number[],
  ): Promise<Map<number, UserFeatureSnapshot>> {
    const features = await this.featureRepo.find({
      where: { userId: In(userIds) },
    });
    const map = new Map<number, UserFeatureSnapshot>();
    features.forEach((f) => map.set(f.userId, f));
    return map;
  }

  @Cron('*/35 * * * *')
  async refreshAllFeatures() {
    const lockKey = 'lock:refresh_features';
    const locked = await this.redis.set(lockKey, '1', 'EX', 300, 'NX');
    if (!locked) {
      this.logger.warn('Refresh already running, skipping this cycle');
      return;
    }

    try {
      this.logger.log('Refreshing feature store...');
      const activeUsers = await this.usersService.getActiveUserIds(1000);

      for (let i = 0; i < activeUsers.length; i += REFRESH_CONCURRENCY) {
        const batch = activeUsers.slice(i, i + REFRESH_CONCURRENCY);
        await Promise.all(batch.map((id) => this.refreshUserFeatures(id)));
        // مکث کوتاه بین بچ‌ها برای کاهش فشار DB
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      this.logger.log(`Refreshed features for ${activeUsers.length} users`);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async refreshUserFeatures(userId: number): Promise<void> {
    try {
      let user: any;
      try {
        user = await this.usersService.findById(userId);
      } catch {
        this.logger.warn(`User ${userId} not found, skipping refresh`);
        return;
      }

      let personality: any;
      try {
        personality = await this.personalityService.analyzePersonality(userId);
      } catch {
        this.logger.warn(
          `Personality not available for user ${userId}, using defaults`,
        );
        personality = { ocean: {} };
      }

      let events: any;
      try {
        events = await this.userEventService.getUserStats(userId);
      } catch {
        this.logger.warn(
          `Event stats failed for user ${userId}, using defaults`,
        );
        events = {
          totalEvents: 0,
          activeDays: 0,
          avgLTV: 0,
          purchaseRate: 0,
          responseRate: 0,
          matchRate: 0,
        };
      }

      const profileVector = await this.encodeProfile(user);
      const behaviorVector = await this.encodeBehavior(events);
      const personalityVector = await this.encodePersonality(personality);
      const geoVector = this.encodeGeo(user);
      const existing = await this.featureRepo.findOne({ where: { userId } });

      const features = this.featureRepo.create({
        userId,
        profileVector,
        behaviorVector,
        personalityVector,
        geoVector,
        avgLTV: events.avgLTV || 0,
        purchaseProbability: events.purchaseRate || 0,
        responseProbability: events.responseRate || 0,
        matchProbability: events.matchRate || 0,
        phase: user.phase || 'cold',
        boostStrength: user.boost?.strength || 0,
        boostExpiresAt: user.boost?.expiresAt,
        preferenceVector: existing?.preferenceVector || profileVector,
      });

      await this.featureRepo.save(features);
      await this.redis.del(this.cacheKey(userId));
    } catch (error) {
      this.logger.error(
        `Failed to refresh features for user ${userId}: ${error}`,
      );
    }
  }

  async updatePreferenceVector(
    uid: number,
    targetProfileVec: number[],
    weight: number,
  ): Promise<void> {
    const features = await this.getUserFeatures(uid);
    const current = features?.preferenceVector || features?.profileVector || [];
    const learningRate = 0.1 * weight;
    const decay = 0.95;

    const updated = current.map((val, i) => {
      const targetVal = targetProfileVec[i] || 0;
      return val * decay + targetVal * learningRate;
    });

    await this.featureRepo.update(
      { userId: uid },
      { preferenceVector: updated },
    );
    await this.redis.del(this.cacheKey(uid));
  }

  private async encodeProfile(user: any): Promise<number[]> {
    const weights = await this.getWeightArray(
      'feature:weights:profile',
      DEFAULT_PROFILE_WEIGHTS,
    );

    // استاندارد سازی سال تولد: اگر عدد > 1400 → جلالی، وگرنه میلادی
    let age = 0;
    if (user.birth_year) {
      const year = parseInt(user.birth_year);
      if (!isNaN(year)) {
        if (year > 1300 && year < 1420) {
          // جلالی: تبدیل به میلادی
          age = new Date().getFullYear() - (year + 621);
        } else {
          // میلادی
          age = new Date().getFullYear() - year;
        }
        age = Math.max(0, Math.min(100, age));
      }
    }

    const raw = [
      user.city ? 1 : 0,
      age / 100,
      Math.min((user.aboutme?.length || 0) / 500, 1),
      (user.hobbies_self?.length || 0) / 10,
      (user.values_self?.length || 0) / 5,
      user.isFaceVerified ? 1 : 0,
      (user.trustScore || 50) / 100,
      user.gender === 'male' ? 1 : 0,
      user.marital ? 1 : 0,
      user.education ? 1 : 0,
    ];
    return raw.map((v, i) => v * weights[i]);
  }

  private async encodeBehavior(events: any): Promise<number[]> {
    const weights = await this.getWeightArray(
      'feature:weights:behavior',
      DEFAULT_BEHAVIOR_WEIGHTS,
    );
    const raw = [
      Math.min((events.totalEvents || 0) / 1000, 1),
      (events.activeDays || 0) / 30,
      events.purchaseRate || 0,
      events.responseRate || 0,
      events.matchRate || 0,
    ];
    return raw.map((v, i) => v * weights[i]);
  }

  private async encodePersonality(personality: any): Promise<number[]> {
    const weights = await this.getWeightArray(
      'feature:weights:personality',
      DEFAULT_PERSONALITY_WEIGHTS,
    );
    const ocean = personality?.ocean || {};
    const raw = [
      ocean.openness || 0.5,
      ocean.conscientiousness || 0.5,
      ocean.extraversion || 0.5,
      ocean.agreeableness || 0.5,
      ocean.neuroticism || 0.5,
    ];
    return raw.map((v, i) => v * weights[i]);
  }

  private encodeGeo(user: any): number[] {
    return [0, 0];
  }

  async getProfileVector(userId: number): Promise<number[] | null> {
    const features = await this.getUserFeatures(userId);
    return features?.profileVector || null;
  }

  async learnFeatureWeights(
    userId: number,
    event: 'purchase' | 'match' | 'message' | 'profile_completed' | 'block',
  ): Promise<void> {
    if (event === 'block') {
      const weights = await this.getWeightArray(
        'feature:weights:behavior',
        DEFAULT_BEHAVIOR_WEIGHTS,
      );
      weights[3] = Math.max(0.1, weights[3] - 0.01);
      await this.redis.set('feature:weights:behavior', JSON.stringify(weights));
      this.logger.log('Block event: decreased response weight for behavior');
      return;
    }

    const weightMap: Record<string, { key: string; index: number }> = {
      purchase: { key: 'feature:weights:behavior', index: 2 },
      match: { key: 'feature:weights:behavior', index: 4 },
      message: { key: 'feature:weights:behavior', index: 3 },
      profile_completed: { key: 'feature:weights:profile', index: 5 },
    };

    const target = weightMap[event];
    if (!target) return;

    const defaults = target.key.includes('profile')
      ? DEFAULT_PROFILE_WEIGHTS
      : DEFAULT_BEHAVIOR_WEIGHTS;

    const weights = await this.getWeightArray(target.key, defaults);
    weights[target.index] = Math.max(0.1, weights[target.index] + 0.01);
    await this.redis.set(target.key, JSON.stringify(weights));
    this.logger.log(
      `Weight ${target.key}[${target.index}] adjusted for event: ${event}`,
    );
  }
}
