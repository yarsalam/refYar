import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/entities/user.entity';
import { PhaseService } from '../../phase/phase.service';
import { VipService } from '../../payments/vip/vip.service';
import { CreditsService } from '../../payments/credits/credits.service';
import { SEOCollectorService } from '../../seo/services/seo-collector.service';
import { FeedCandidateService } from './feed-candidate.service';
import { FeedScoringService } from './feed-scoring.service';
import { FeedRelationService } from './feed-relation.service';
import { FeedPromotionService } from './feed-promotion.service';
import { BuildFeedOptions, FeedItem, FeedUser } from '../types/feed.types';
import { FeedPhase } from '../types/feed-phase.interface';
import { UserImage } from '../../user_images/entities/user_image.entity';

@Injectable()
export class FeedAssemblerService {
  private readonly logger = new Logger(FeedAssemblerService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly vipService: VipService,
    private readonly creditsService: CreditsService,
    private readonly seoCollector: SEOCollectorService,
    private readonly candidateService: FeedCandidateService,
    private readonly scoringService: FeedScoringService,
    private readonly relationService: FeedRelationService,
    private readonly promotionService: FeedPromotionService,
    private readonly phaseService: PhaseService,
  ) {}

  private mapUserToFeed(user: User): FeedUser {
    const mainImage =
      user.userImages?.find((img: UserImage) => img.isMain) ||
      user.userImages?.[0];
    return {
      id: user.id,
      nickname: user.nickname,
      city: user.city,
      gender: user.gender,
      age: this.calculateAge(user.birth_year ?? ''),
      hobbies_self: (user.hobbies_self || []).slice(0, 3),
      values_self: (user.values_self || []).slice(0, 3),
      userImages: mainImage ? [{ url: mainImage.url, isMain: true }] : [],
    };
  }

  private calculateAge(birthYear: string): number {
    if (!birthYear) return 0;
    const year = parseInt(birthYear);
    if (isNaN(year)) return 0;
    let age: number;
    if (year > 1300 && year < 1420) {
      age = new Date().getFullYear() - (year + 621);
    } else {
      age = new Date().getFullYear() - year;
    }
    return Math.max(0, Math.min(100, age));
  }

  private async addUsersToFeed(
    feed: FeedItem[],
    userIds: number[],
    usedUserIds: Set<number>,
    source: 'boost' | 'vip' | 'credit',
    priorityValue?: number,
  ): Promise<void> {
    const newIds = userIds.filter((id) => !usedUserIds.has(id));
    if (newIds.length === 0) return;

    const users = await this.candidateService.getUsersByIds(newIds);
    for (const user of users) {
      const priority =
        priorityValue ?? this.scoringService.assignPriorityBySource(source);
      feed.push({
        id: randomUUID(),
        type: 'user',
        data: this.mapUserToFeed(user),
        priority,
      });
      usedUserIds.add(user.id);
    }
  }

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

    const enrichedPhase: FeedPhase = {
      phase: (['cold', 'warm', 'hot'].includes(phase.phase)
        ? phase.phase
        : 'cold') as FeedPhase['phase'],
      vipActive: isVip,
      boostActive: !!(
        user.boost?.activeUntil && new Date(user.boost.activeUntil) > new Date()
      ),
      everPaid: phase.everPaid,
      isCompleted: user.isCompleted,
    };

    const [boostedIds, vipIds, creditIds] = await Promise.all([
      this.candidateService.getBoostedCandidates(3),
      this.candidateService.getVipCandidates(2),
      this.candidateService.getHighCreditCandidates(2),
    ]);

    const suggestions = await this.candidateService.getSuggestionCandidates(
      userId,
      options.limit || 20,
    );

    const feed: FeedItem[] = [];
    const usedUserIds = new Set<number>([userId]);

    await this.addUsersToFeed(feed, boostedIds, usedUserIds, 'boost');
    await this.addUsersToFeed(feed, vipIds, usedUserIds, 'vip');
    await this.addUsersToFeed(feed, creditIds, usedUserIds, 'credit');

    for (const suggestion of suggestions) {
      if (feed.length >= (options.limit || 20) * 2) break;
      const sid = suggestion.user?.id || suggestion.id;
      if (sid && !usedUserIds.has(sid)) {
        const priority = this.scoringService.assignPriorityBySource(
          'suggestion',
          suggestion.score,
        );
        feed.push({
          id: randomUUID(),
          type: 'user',
          data: this.mapUserToFeed(suggestion.user || suggestion),
          priority,
        });
        usedUserIds.add(sid);
      }
    }

    const sortedFeed = this.scoringService.sortByPriority(feed);
    const limitedFeed = sortedFeed.slice(0, options.limit || 20);

    const targetIds = limitedFeed
      .filter((i) => i.type === 'user')
      .map((i) => (i.data as any).id);
    const relationsMap = await this.relationService.filterBlockedUsers(
      userId,
      targetIds,
    );
    const filteredFeed = this.relationService.applyRelationFilter(
      limitedFeed,
      relationsMap,
    );

    // ─── FIX N+1: batch promotion قبل از حلقه ─────────────────────────────
    const allowedTypes =
      this.promotionService.getAllowedPromotionTypes(enrichedPhase);

    const MAX_PROMOTIONS =
      enrichedPhase.phase === 'cold'
        ? 1
        : enrichedPhase.phase === 'warm'
          ? 2
          : 3;

    // تعیین پوزیشن‌هایی که promo باید وارد شود (هر ۳ آیتم یک promo)
    const promoPositions = [0, 3, 6, 9]
      .filter((p) => p < filteredFeed.length)
      .slice(0, MAX_PROMOTIONS);

    // یک batch call به جای N تا await در حلقه
    const promos = await this.promotionService.decideBatch(
      userId,
      allowedTypes,
      enrichedPhase,
      promoPositions,
    );

    // ساخت فید نهایی با درج promoها در پوزیشن‌های از پیش تعیین‌شده
    const finalFeed: FeedItem[] = [];
    let promoIdx = 0;
    let promotionsShown = 0;

    for (let i = 0; i < filteredFeed.length; i++) {
      finalFeed.push(filteredFeed[i]);

      if (
        promoIdx < promos.length &&
        i === promoPositions[promoIdx] &&
        promotionsShown < MAX_PROMOTIONS
      ) {
        const promo = promos[promoIdx];
        if (promo) {
          finalFeed.push(promo);
          promotionsShown++;
        }
        promoIdx++;
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    this.seoCollector
      .collectFeedMetrics(userId, finalFeed.length)
      .catch((err) => this.logger.error('SEO collection failed', err));

    const duration = Date.now() - startTime;
    this.logger.log(
      `Feed built for user ${userId}: ${finalFeed.length} items, ${promotionsShown} promos, ${duration}ms`,
    );

    return finalFeed.slice(0, options.limit || 20);
  }
}
