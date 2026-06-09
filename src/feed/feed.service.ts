import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { PhaseService } from '../phase/phase.service';
import { SuggestionService } from '../suggestion/suggestion.service';
import { UserEventService } from '../user-event/user-event.service';
import {
  FeedItem,
  PromotionConfig,
  BuildFeedOptions,
  FeedUser,
} from './feed.types';
import { BoostQueueService } from 'src/redis/boost-queue.service';
import { EventType } from 'src/user-event/entities/user-event.entity';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { PromotionEngineService } from 'src/payments/promotion-engine.service';
import { PromotionExposureService } from 'src/payments/promotion-exposure.service';
import { SEOCollectorService } from 'src/seo/services/seo-collector.service';
import { VipService } from 'src/payments/vip/vip.service';
import { CreditsService } from 'src/payments/credits/credits.service';
import { RelationStatusService } from 'src/relation-status/relation-status.service';

@Injectable()
export class FeedBuilderService {
  private readonly logger = new Logger(FeedBuilderService.name);
  private readonly CACHE_TTL = 30;

  private readonly PROMOTION_TEMPLATES: Record<string, PromotionConfig> = {
    profile: {
      variant: 'profile',
      title: 'پروفایلت رو کامل کن!',
      subtitle: 'پروفایل کامل = ۵ برابر لایک بیشتر\nفقط چند دقیقه طول می‌کشه',
      ctaText: 'کامل کن',
      ctaColor: '#00BFFF',
      gradientColors: ['#383232', '#006994', '#1b1818'],
      titleColor: '#00BFFF',
      promoImage:
        'https://via.placeholder.com/300x360/00BFFF/000000?text=Complete+Profile+✨',
      navigationTarget: 'EditProfile',
    },
    boost: {
      variant: 'boost',
      title: 'دیده شو!',
      subtitle: '۳۰ دقیقه در صدر لیست\n۱۰ برابر بازدید بیشتر',
      ctaText: 'بوست بزن',
      ctaColor: '#FFD700',
      gradientColors: ['#383232', '#4a2c00', '#1b1818'],
      titleColor: '#FFD700',
      promoImage:
        'https://via.placeholder.com/300x360/FFD700/000000?text=Boost+Now+🔥',
      navigationTarget: 'Payment',
      navigationParams: { type: 'boost' },
    },
    vip: {
      variant: 'vip',
      title: 'VIP شو!',
      subtitle: 'لایک نامحدود + اولویت همیشگی\nبدون محدودیت و دیده شدن بیشتر',
      ctaText: 'VIP فعال کن',
      ctaColor: '#00FFAA',
      gradientColors: ['#383232', '#006400', '#1b1818'],
      titleColor: '#00FFAA',
      promoImage:
        'https://via.placeholder.com/300x360/00FFAA/000000?text=VIP+Unlimited+⭐',
      navigationTarget: 'Payment',
      navigationParams: { type: 'vip' },
    },
    credit: {
      variant: 'credit',
      title: 'اعتبار بیشتر؟',
      subtitle: 'پیام و سوپرلایک بیشتر\nهمین حالا شارژ کن',
      ctaText: 'اعتبار بگیر',
      ctaColor: '#FFAA00',
      gradientColors: ['#383232', '#8B4513', '#1b1818'],
      titleColor: '#FFAA00',
      promoImage:
        'https://via.placeholder.com/300x360/FFAA00/000000?text=Credits+Ready+💰',
      navigationTarget: 'Payment',
      navigationParams: { type: 'credit' },
    },
    bundle: {
      variant: 'credit',
      title: '🎁 بسته شروع',
      subtitle: '۲۰ اعتبار + ۲ بوست\n۵۰٪ تخفیف ویژه',
      ctaText: 'شروع کن',
      ctaColor: '#FFAA00',
      gradientColors: ['#383232', '#8B4513', '#1b1818'],
      titleColor: '#FFAA00',
      promoImage:
        'https://via.placeholder.com/300x360/FFAA00/000000?text=Starter+Bundle+✨',
      navigationTarget: 'Payment',
      navigationParams: { type: 'bundle' },
    },
  };

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @Inject(forwardRef(() => PhaseService))
    private readonly phaseService: PhaseService,

    private readonly boostQueueService: BoostQueueService,
    private readonly suggestionService: SuggestionService,
    private readonly userEventService: UserEventService,
    private readonly promotionEngine: PromotionEngineService,
    private readonly exposureService: PromotionExposureService,
    private readonly seoCollector: SEOCollectorService,
    private readonly vipService: VipService,
    private readonly creditsService: CreditsService,
    private readonly relationStatus: RelationStatusService,

    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async buildFeed(
    userId: number,
    options: BuildFeedOptions = {},
  ): Promise<FeedItem[]> {
    const startTime = Date.now();
    const [user, phase] = await Promise.all([
      this.userRepo.findOne({
        where: { id: userId },
        relations: ['userImages', 'boost'],
      }),
      this.phaseService.get(userId),
    ]);

    if (!user) return [];

    const [isVip, credit] = await Promise.all([
      this.vipService.hasVip(userId),
      this.creditsService.get(userId),
    ]);

    const enrichedPhase = {
      ...phase,
      boostActive: !!(
        user.boost?.activeUntil && new Date(user.boost.activeUntil) > new Date()
      ),
      vipActive: isVip,
      creditsBalance: credit?.balance || 0,
      isCompleted: user.isCompleted,
    };

    const baseFeed = await this.buildBaseFeed(userId, user, options);
    const enrichedFeed = await this.enrichWithRelationStatus(userId, baseFeed);
    const allowedTypes = this.getAllowedPromotionTypes(enrichedPhase);
    const finalFeed = await this.injectAIPromotions(
      enrichedFeed,
      userId,
      allowedTypes,
      enrichedPhase,
    );

    this.seoCollector
      .collectFeedMetrics(userId, finalFeed.length)
      .catch((err) => this.logger.error('SEO collection failed', err));

    const duration = Date.now() - startTime;
    const promoCount = finalFeed.filter((f) => f.type === 'promotion').length;
    this.logger.log(
      `Feed built for user ${userId}: ${finalFeed.length} items, ${promoCount} promos, ${duration}ms`,
    );

    return finalFeed.slice(0, options.limit || 20);
  }

  private async enrichWithRelationStatus(
    userId: number,
    feed: FeedItem[],
  ): Promise<FeedItem[]> {
    const targetIds = feed
      .filter((item) => item.type === 'user')
      .map((item) => (item.data as any).id);

    if (targetIds.length === 0) return feed;

    const relationsMap = await this.relationStatus.getEffectiveRelationsBatch(
      userId,
      targetIds,
    );

    return feed.filter((item) => {
      if (item.type === 'user') {
        const uid = (item.data as any).id;
        const rel = relationsMap.get(uid);
        if (rel?.isBlocked) return false;
        (item as any).relation = rel;
      }
      return true;
    });
  }

  private randomSample<T>(arr: T[], count: number): T[] {
    if (arr.length <= count) return arr;
    return [...arr].sort(() => 0.5 - Math.random()).slice(0, count);
  }

  private async buildBaseFeed(
    userId: number,
    user: User,
    options: BuildFeedOptions,
  ): Promise<FeedItem[]> {
    const [boostedTop, vipTop, creditTop] = await Promise.all([
      this.boostQueueService.getBoostedUsers(10),
      this.boostQueueService.getActiveVipUsers(8),
      this.boostQueueService.getHighCreditUsers(8),
    ]);

    const boostedUserIds = this.randomSample(boostedTop, 3);
    const vipUserIds = this.randomSample(vipTop, 2);
    const highCreditUserIds = this.randomSample(creditTop, 2);

    const suggestions = await this.suggestionService.getSuggestionsForUser(
      userId,
      {
        limit: (options.limit || 20) * 2,
        city: options.city,
      },
    );

    const feed: FeedItem[] = [];
    const usedUserIds = new Set<number>([userId]);

    // اولویت اول: بوست شده‌ها
    await this.addUsersToFeed(feed, boostedUserIds, usedUserIds, 100);
    // اولویت دوم: VIPها
    await this.addUsersToFeed(feed, vipUserIds, usedUserIds, 80);
    // اولویت سوم: اعتبار بالا
    await this.addUsersToFeed(feed, highCreditUserIds, usedUserIds, 60);

    // بقیه کاربران از suggestion
    for (const suggestion of suggestions) {
      if (feed.length >= (options.limit || 20) * 2) break;
      const sid = suggestion.user?.id || suggestion.id;
      if (sid && !usedUserIds.has(sid)) {
        feed.push({
          id: randomUUID(),
          type: 'user',
          data: this.mapUserToFeed(suggestion.user || suggestion),
          priority: suggestion.score,
        });
        usedUserIds.add(sid);
      }
    }

    return feed.slice(0, options.limit || 20);
  }

  // رفع N+1: دریافت batch و استفاده از Map
  private async addUsersToFeed(
    feed: FeedItem[],
    userIds: number[],
    usedUserIds: Set<number>,
    priority: number,
  ) {
    const newIds = userIds.filter((id) => !usedUserIds.has(id));
    if (newIds.length === 0) return;

    const users = await this.userRepo.find({
      where: { id: In(newIds) },
      relations: ['userImages'],
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    for (const id of newIds) {
      const user = userMap.get(id);
      if (user) {
        feed.push({
          id: randomUUID(),
          type: 'user',
          data: this.mapUserToFeed(user),
          priority,
        });
        usedUserIds.add(id);

        if (priority === 100) this.boostQueueService.markShown(id);
        else if (priority === 80) this.boostQueueService.markShownVip(id);
        else if (priority === 60) this.boostQueueService.markShownCredit(id);
      }
    }
  }

  private getAllowedPromotionTypes(phase: any): string[] {
    if (phase.vipActive) return [];

    let allowed: string[] = [];

    switch (phase.phase) {
      case 'cold':
        allowed = !phase.isCompleted ? ['profile'] : ['boost', 'credit', 'vip'];
        break;
      case 'warm':
        allowed = ['credit', 'boost'];
        break;
      case 'hot':
        allowed = phase.everPaid
          ? ['vip', 'credit']
          : ['vip', 'bundle', 'credit'];
        break;
      default:
        allowed = [];
    }

    if (phase.boostActive) {
      allowed = allowed.filter((t) => t !== 'boost');
    }

    return allowed;
  }

  private async injectAIPromotions(
    baseFeed: FeedItem[],
    userId: number,
    allowedTypes: string[],
    phase: any,
  ): Promise<FeedItem[]> {
    if (allowedTypes.length === 0) return baseFeed;

    const finalFeed: FeedItem[] = [];
    let promotionsShown = 0;
    const MAX_PROMOTIONS =
      phase.phase === 'cold' ? 1 : phase.phase === 'warm' ? 2 : 3;

    for (let i = 0; i < baseFeed.length; i++) {
      finalFeed.push(baseFeed[i]);

      if (promotionsShown < MAX_PROMOTIONS && i % 3 === 0) {
        const decision = await this.promotionEngine.decide(
          userId,
          allowedTypes,
          {
            feed_position: i,
            phase: phase.phase,
            user_phase: phase,
          },
        );

        if (decision.variant) {
          const promotion = this.personalizePromotionContent(
            decision.variant,
            phase,
          );
          const promotionId = randomUUID();

          finalFeed.push({
            id: promotionId,
            type: 'promotion',
            data: promotion,
            score: decision.score,
          });

          await this.redis.set(
            `promo:map:${promotionId}`,
            JSON.stringify({
              userId,
              variant: decision.variant,
              score: decision.score,
              phase: phase.phase,
              tone: 'soft_sell',
            }),
            'EX',
            3600,
          );

          await this.exposureService.trackImpression(userId, decision.variant);
          await this.userEventService.log({
            userId,
            type: EventType.PROMOTION_SHOWN,
            metadata: {
              variant: decision.variant,
              score: decision.score,
              position: i,
              promotionId,
            },
          });

          promotionsShown++;
        }
      }
    }

    return finalFeed;
  }

  private personalizePromotionContent(
    variant: string,
    phase: any,
  ): PromotionConfig {
    const template = this.PROMOTION_TEMPLATES[variant];
    if (!template) return template;

    const personalized: PromotionConfig = JSON.parse(JSON.stringify(template));
    const userPhase = phase.phase || 'cold';
    const everPaid = phase.everPaid || false;

    switch (variant) {
      case 'boost':
        if (userPhase === 'cold') {
          personalized.title = 'اولین قدم رو بردار! 🚀';
          personalized.subtitle = 'با Boost رایگان، ۱۰ برابر بیشتر دیده شو';
          personalized.ctaText = 'امتحان می‌کنم';
        } else if (userPhase === 'warm') {
          personalized.title = 'دیده شو! 🔥';
          personalized.subtitle =
            '۳۰ دقیقه در صدر لیست • ۱۰ برابر بازدید بیشتر';
          personalized.ctaText = 'Boost کن';
        } else {
          personalized.title = everPaid
            ? 'حرفه‌ای شو! 👑'
            : 'اولین بار ویژه 🎁';
          personalized.subtitle = everPaid
            ? '۳۰ دقیقه صدرنشین باش و شانس مچ رو ببر بالا'
            : '۳۰ دقیقه طلایی • مخصوص تو';
          personalized.ctaText = everPaid ? 'Boost VIP' : 'شروع کن';
        }
        break;
      case 'vip':
        if (userPhase === 'cold') {
          personalized.title = 'VIP شدن چه مزایایی داره؟ 🤔';
          personalized.subtitle = 'ببین چرا VIP ها ۵ برابر بیشتر مچ می‌شن';
          personalized.ctaText = 'می‌خوام بدونم';
        } else if (userPhase === 'warm') {
          personalized.title = 'VIP شو! ⭐';
          personalized.subtitle = 'لایک نامحدود + اولویت همیشگی';
          personalized.ctaText = 'VIP فعال کن';
        } else {
          personalized.title = 'ارتقا به VIP طلایی! 👑';
          personalized.subtitle = 'بدون محدودیت، بدون توقف • مخصوص تو';
          personalized.ctaText = 'همین الان';
        }
        break;
      case 'credit':
        if (userPhase === 'cold') {
          personalized.title = 'اعتبار چیه؟ 💬';
          personalized.subtitle = 'با اعتبار می‌تونی به هرکی خواستی پیام بدی';
          personalized.ctaText = 'بیشتر بدون';
        } else if (userPhase === 'warm') {
          personalized.title = 'اعتبار بیشتری می‌خوای؟ 💰';
          personalized.subtitle = 'حرف‌های ناگفته رو بزن • پیام بفرست';
          personalized.ctaText = 'اعتبار بگیر';
        } else {
          personalized.title = 'شارژ سریع اعتبار ⚡';
          personalized.subtitle = 'پیام‌های نامحدود • مخصوص کاربران فعال';
          personalized.ctaText = 'شارژ کن';
        }
        break;
      case 'profile':
        personalized.title =
          userPhase === 'cold'
            ? 'پروفایلت رو بساز! ✨'
            : 'پروفایلت رو جذاب‌تر کن! 🎨';
        personalized.subtitle =
          userPhase === 'cold'
            ? 'با پروفایل کامل، ۵ برابر بیشتر دیده می‌شی'
            : 'عکس و توضیحات جدید = شانس بیشتر';
        personalized.ctaText =
          userPhase === 'cold' ? 'شروع می‌کنم' : 'ویرایش پروفایل';
        break;
    }

    return personalized;
  }

  private mapUserToFeed(user: any): FeedUser {
    const mainImage =
      user.userImages?.find((img: any) => img.isMain) || user.userImages?.[0];
    return {
      id: user.id,
      nickname: user.nickname,
      city: user.city,
      gender: user.gender,
      age: this.calculateAge(user.birth_year),
      hobbies_self: (user.hobbies || []).slice(0, 3),
      values_self: (user.values || []).slice(0, 3),
      userImages: mainImage ? [{ url: mainImage.url, isMain: true }] : [],
    };
  }

  private calculateAge(birthYear: string): number {
    if (!birthYear) return 0;
    const year = parseInt(birthYear);
    if (isNaN(year)) return 0;

    let age: number;
    if (year > 1300 && year < 1420) {
      // جلالی
      age = new Date().getFullYear() - (year + 621);
    } else {
      // میلادی
      age = new Date().getFullYear() - year;
    }
    return Math.max(0, Math.min(100, age));
  }

  async invalidateFeedCache(userId: number): Promise<void> {
    const pattern = `feed:v2:${userId}:*`;
    let cursor = '0';
    const keys: string[] = [];

    // استفاده از SCAN به جای KEYS
    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.debug(
        `Invalidated ${keys.length} feed cache keys for user ${userId}`,
      );
    }
  }

  async getUserFeedQuality(userId: number): Promise<void> {}
}
