import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { UserFeatureSnapshot } from '../../feature-store/entities/user-feature.entity';
import { BoostQueueService } from '../../redis/boost-queue.service';
import { User } from '../../users/entities/user.entity';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import Redis from 'ioredis';

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @InjectRepository(UserFeatureSnapshot)
    private readonly featureRepo: Repository<UserFeatureSnapshot>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    private readonly boostQueue: BoostQueueService,
  ) {}

  private readonly DEFAULT_SEARCH_WEIGHTS = {
    profile: 0.5,
    personality: 0.8,
    behavior: 1.0,
  };

  async findCandidates(userId: number, limit = 200): Promise<number[]> {
    const boostedIds = await this.boostQueue.getBoostedUsers(10);

    // ۱. سعی کن snapshot کاربر فعلی را بگیری
    const userFeatures = await this.featureRepo.findOne({ where: { userId } });

    let searchVector: number[] | null = null;

    if (userFeatures) {
      // اگر snapshot وجود دارد، بردار جستجو = ترکیب وزنی سه بردار خودش
      const weights = await this.getSearchWeights();
      searchVector = this.mergeVectors(
        userFeatures.profileVector || [],
        userFeatures.behaviorVector || [],
        userFeatures.personalityVector || [],
        weights,
      );
    } else {
      // fallback: از profileVector استاتیک
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user) {
        searchVector = this.buildProfileVectorFromUser(user);
      }
    }

    if (!searchVector || searchVector.length === 0) {
      return boostedIds.slice(0, limit);
    }

    const similarIds = await this.findSimilarUsers(
      searchVector,
      limit - boostedIds.length,
      userId,
    );
    return [...new Set([...boostedIds, ...similarIds])]
      .filter((id) => id !== userId)
      .slice(0, limit);
  }

  private mergeVectors(
    profile: number[],
    behavior: number[],
    personality: number[],
    weights: { profile: number; behavior: number; personality: number },
  ): number[] {
    const maxLen = Math.max(
      profile.length,
      behavior.length,
      personality.length,
      1,
    );
    return Array.from({ length: maxLen }, (_, i) => {
      const p = profile[i] ?? 0;
      const b = behavior[i] ?? 0;
      const pr = personality[i] ?? 0;
      return (
        p * weights.profile + b * weights.behavior + pr * weights.personality
      );
    });
  }

  private async getSearchWeights(): Promise<
    typeof this.DEFAULT_SEARCH_WEIGHTS
  > {
    try {
      const stored = await this.redis.get('search:weights');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    // در صورت نبود Redis یا خطا، پیش‌فرض را برگردان
    return this.DEFAULT_SEARCH_WEIGHTS;
  }

  private async findSimilarUsers(
    searchVector: number[],
    limit: number,
    excludeUserId: number,
  ): Promise<number[]> {
    // ۱. تلاش برای خواندن از کش
    const cacheKey = `similar:${excludeUserId}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // ۲. محاسبه عادی (دقیقاً مشابه قبل)
    const weights = await this.getSearchWeights();

    const snapshots = await this.featureRepo
      .createQueryBuilder('s')
      .select([
        's.userId',
        's.profileVector',
        's.behaviorVector',
        's.personalityVector',
      ])
      .where('s.userId != :exclude', { exclude: excludeUserId })
      .getMany();

    const distances = snapshots
      .filter((s) => s.userId !== excludeUserId)
      .map((s) => {
        const pVec = s.profileVector || [];
        const bVec = s.behaviorVector || [];
        const persVec = s.personalityVector || [];

        const mergedLength = Math.max(
          pVec.length,
          bVec.length,
          persVec.length,
          1,
        );
        const mergedSelf = new Array(mergedLength)
          .fill(0)
          .map(
            (_, i) =>
              (pVec[i] ?? 0) * weights.profile +
              (bVec[i] ?? 0) * weights.behavior +
              (persVec[i] ?? 0) * weights.personality,
          );
        const searchPadded = new Array(mergedLength)
          .fill(0)
          .map((_, i) => searchVector[i] ?? 0);

        const distance = this.euclideanDistance(searchPadded, mergedSelf);
        return { userId: s.userId, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((d) => d.userId);

    // ۳. ذخیره در کش برای درخواست‌های بعدی (بدون افت کیفیت)
    await this.redis.set(cacheKey, JSON.stringify(distances), 'EX', 60); // ۶۰ ثانیه

    return distances;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  private buildProfileVectorFromUser(user: User): number[] {
    return [
      user.city ? 1 : 0,
      user.birth_year
        ? (new Date().getFullYear() - (parseInt(user.birth_year) + 621)) / 100
        : 0,
      Math.min((user.aboutme?.length || 0) / 500, 1),
      (user.hobbies_self?.length || 0) / 10,
      (user.values_self?.length || 0) / 5,
      user.isFaceVerified ? 1 : 0,
      (user.trustScore || 50) / 100,
      user.gender === 'male' ? 1 : 0,
      user.marital ? 1 : 0,
      user.education ? 1 : 0,
    ];
  }
}
