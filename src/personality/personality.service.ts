import { HttpService } from '@nestjs/axios';
import { Injectable, HttpException, Inject, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Personality } from './entities/personality.entity';
import { Cron } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { Payment } from 'src/payments/entities/payment.entity';
import { createHash } from 'crypto';

const DEFAULT_PERSONALITY_WEIGHTS: Record<string, number> = {
  openness: 1.0,
  conscientiousness: 1.0,
  extraversion: 1.0,
  agreeableness: 1.0,
  neuroticism: 1.0,
  sentiment_positive: 1.0,
  sentiment_negative: 1.0,
};

// TTL برای جلوگیری از انباشت کلیدها در Redis
const WEIGHT_TTL = 86400 * 30; // 30 روز
const CACHE_TTL = 86400; // ۲۴ ساعت برای cache تحلیل

@Injectable()
export class PersonalityService {
  private readonly logger = new Logger(PersonalityService.name);

  constructor(
    private readonly httpService: HttpService,

    @InjectRepository(Personality)
    private readonly repo: Repository<Personality>,

    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,

    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── وزن‌های داینامیک ──────────────────────────────────────────────────────

  private async getPersonalityWeight(key: string): Promise<number> {
    const stored = await this.redis.get(`personality:weight:${key}`);
    return stored
      ? parseFloat(stored)
      : (DEFAULT_PERSONALITY_WEIGHTS[key] ?? 1.0);
  }

  private async setPersonalityWeight(
    key: string,
    value: number,
  ): Promise<void> {
    // TTL مشخص برای جلوگیری از انباشت بی‌پایان در Redis
    await this.redis.set(
      `personality:weight:${key}`,
      value.toString(),
      'EX',
      WEIGHT_TTL,
    );
  }

  // ── متدهای اصلی ──────────────────────────────────────────────────────────

  private apiUrl(): string {
    return process.env.PERSONALITY_AI_URL || 'http://personality:8101';
  }

  private hashMessages(messages: string[]): string {
    return createHash('sha256').update(messages.join('|')).digest('hex');
  }

  async analyzeSentiment(messages: string[]): Promise<any> {
    // استفاده از hash به جای JSON.stringify برای جلوگیری از کلید انفجاری
    const cacheKey = `sentiment:${this.hashMessages(messages)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      const resp = await firstValueFrom(
        this.httpService.post(`${this.apiUrl()}/analyze_sentiment`, {
          messages,
        }),
      );
      await this.redis.set(
        cacheKey,
        JSON.stringify(resp.data.sentiments),
        'EX',
        CACHE_TTL,
      );
      return resp.data.sentiments;
    } catch {
      throw new HttpException('Personality AI unavailable', 503);
    }
  }

  async analyzeEmotion(messages: string[]): Promise<any> {
    const cacheKey = `emotion:${this.hashMessages(messages)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      const resp = await firstValueFrom(
        this.httpService.post(`${this.apiUrl()}/analyze_emotion`, { messages }),
      );
      await this.redis.set(
        cacheKey,
        JSON.stringify(resp.data.emotions),
        'EX',
        CACHE_TTL,
      );
      return resp.data.emotions;
    } catch {
      throw new HttpException('Personality AI unavailable', 503);
    }
  }

  async analyzePersonality(userId: number) {
    const personality = await this.repo.findOne({ where: { userId } });
    if (!personality) {
      return {
        ocean: {},
        sentiment: 'neutral',
        emotion: 'neutral',
        weights: {},
      };
    }

    // ساخت ocean از ستون‌های مستقل (اگر مقداردهی شده) یا از JSON قدیمی
    const rawOcean = {
      openness: personality.openness ?? personality.ocean?.openness ?? 0.5,
      conscientiousness:
        personality.conscientiousness ??
        personality.ocean?.conscientiousness ??
        0.5,
      extraversion:
        personality.extraversion ?? personality.ocean?.extraversion ?? 0.5,
      agreeableness:
        personality.agreeableness ?? personality.ocean?.agreeableness ?? 0.5,
      neuroticism:
        personality.neuroticism ?? personality.ocean?.neuroticism ?? 0.5,
    };

    if (!Object.values(rawOcean).some((v) => v !== 0.5)) {
      return {
        ocean: {},
        sentiment: 'neutral',
        emotion: 'neutral',
        weights: {},
      };
    }

    // بارگذاری موازی وزن‌ها
    const weightKeys = Object.keys(DEFAULT_PERSONALITY_WEIGHTS);
    const weightValues = await Promise.all(
      weightKeys.map((k) => this.getPersonalityWeight(k)),
    );
    const weights: Record<string, number> = Object.fromEntries(
      weightKeys.map((k, i) => [k, weightValues[i]]),
    );

    const weightedOcean = {
      openness: rawOcean.openness * weights.openness,
      conscientiousness: rawOcean.conscientiousness * weights.conscientiousness,
      extraversion: rawOcean.extraversion * weights.extraversion,
      agreeableness: rawOcean.agreeableness * weights.agreeableness,
      neuroticism: rawOcean.neuroticism * weights.neuroticism,
    };

    return {
      ocean: weightedOcean,
      sentiment: personality.sentiment || 'neutral',
      emotion: personality.emotion || 'neutral',
      weights,
    };
  }

  async learnFromMatch(userId1: number, userId2: number): Promise<void> {
    const [p1, p2] = await Promise.all([
      this.analyzePersonality(userId1),
      this.analyzePersonality(userId2),
    ]);

    const features = [
      'openness',
      'conscientiousness',
      'extraversion',
      'agreeableness',
      'neuroticism',
    ];

    for (const f of features) {
      if (!p1.ocean[f] || !p2.ocean[f]) continue;
      const avg = (p1.ocean[f] + p2.ocean[f]) / 2;
      const current = await this.getPersonalityWeight(f);
      const reward = avg > 0.6 ? 0.01 : -0.005;
      const newVal = Math.max(0.1, Math.min(3.0, current + reward));
      await this.setPersonalityWeight(f, newVal);
    }

    if (p1.sentiment === 'positive' && p2.sentiment === 'positive') {
      const cur = await this.getPersonalityWeight('sentiment_positive');
      await this.setPersonalityWeight(
        'sentiment_positive',
        Math.min(3.0, cur + 0.01),
      );
    }
  }

  @Cron('0 5 * * 0') // یکشنبه‌ها
  async pruneWeights(): Promise<void> {
    this.logger.log('Pruning personality weights...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    // دریافت IDs کاربران پولی
    const payingUsers = await this.paymentRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.userId', 'userId')
      .where('p.createdAt > :date', { date: thirtyDaysAgo })
      .andWhere('p.status = :status', { status: 'paid' })
      .getRawMany();

    const paidUserIds = payingUsers.map((u: any) => Number(u.userId));

    if (paidUserIds.length < 20) {
      this.logger.warn('Not enough paying users to prune weights');
      return;
    }

    const features = Object.keys(DEFAULT_PERSONALITY_WEIGHTS).filter(
      (f) => !f.startsWith('sentiment'),
    );

    // یک query برای همه کاربران پولی — نه N queries
    const personalities = await this.repo
      .createQueryBuilder('p')
      .where('p.userId IN (:...ids)', { ids: paidUserIds.slice(0, 200) })
      .getMany();

    // محاسبه میانگین هر feature
    const avgWeights: Record<string, number> = {};
    for (const f of features) {
      let sum = 0;
      let count = 0;
      for (const p of personalities) {
        const val = (p as any)[f] ?? p.ocean?.[f];
        if (val !== undefined && val !== null) {
          sum += val;
          count++;
        }
      }
      avgWeights[f] = count > 0 ? sum / count : 0.5;
    }

    for (const f of features) {
      const current = await this.getPersonalityWeight(f);
      const avg = avgWeights[f] ?? 0.5;
      if (avg < 0.4 && current > 0.2) {
        const newVal = Math.max(0.1, current - 0.05);
        await this.setPersonalityWeight(f, newVal);
        this.logger.log(
          `Pruned "${f}": ${current.toFixed(2)} → ${newVal.toFixed(2)} (avg in payers: ${avg.toFixed(2)})`,
        );
      }
    }
  }
}
