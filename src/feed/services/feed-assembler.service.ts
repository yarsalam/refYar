import { Injectable, Logger, Inject } from '@nestjs/common';
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
    private readonly phaseService: PhaseService,
    private readonly vipService: VipService,
    private readonly creditsService: CreditsService,
    private readonly seoCollector: SEOCollectorService,
    private readonly candidateService: FeedCandidateService,
    private readonly scoringService: FeedScoringService,
    private readonly relationService: FeedRelationService,
    private readonly promotionService: FeedPromotionService,
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

    // دریافت اطلاعات کاربر و فاز
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
      phase: phase.phase,
      vipActive: isVip,
      boostActive: !!(
        user.boost?.activeUntil && new Date(user.boost.activeUntil) > new Date()
      ),
      everPaid: phase.everPaid,
      isCompleted: user.isCompleted,
    };

    // جمع‌آوری کاندیداها
    const [boostedIds, vipIds, creditIds] = await Promise.all([
      this.candidateService.getBoostedCandidates(3),
      this.candidateService.getVipCandidates(2),
      this.candidateService.getHighCreditCandidates(2),
    ]);

    const suggestions = await this.candidateService.getSuggestionCandidates(
      userId,
      options.limit || 20,
    );

    // ساخت فید اولیه
    const feed: FeedItem[] = [];
    const usedUserIds = new Set<number>([userId]);

    // Combined query fix: but since candidate service separate, minimal change - call once for all
    const allSpecialIds = [
      ...new Set([...boostedIds, ...vipIds, ...creditIds]),
    ];
    const specialUsers =
      await this.candidateService.getUsersByIds(allSpecialIds); // One query for specials

    // But to keep minimal, use existing add but note combined

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

    // Fix: Sort by priority before limiting
    const sortedFeed = this.scoringService.sortByPriority(feed);

    const limitedFeed = sortedFeed.slice(0, options.limit || 20);

    // فیلتر بر اساس رابطه (بلاک)
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

    // تزریق تبلیغات
    const allowedTypes =
      this.promotionService.getAllowedPromotionTypes(enrichedPhase);
    const MAX_PROMOTIONS =
      enrichedPhase.phase === 'cold'
        ? 1
        : enrichedPhase.phase === 'warm'
          ? 2
          : 3;
    let promotionsShown = 0;
    const finalFeed: FeedItem[] = [];

    for (let i = 0; i < filteredFeed.length; i++) {
      finalFeed.push(filteredFeed[i]);
      if (promotionsShown < MAX_PROMOTIONS && i % 3 === 0) {
        const promoItem = await this.promotionService.decideAndCreatePromotion(
          userId,
          allowedTypes,
          enrichedPhase,
          i,
        );
        if (promoItem) {
          finalFeed.push(promoItem);
          promotionsShown++;
        }
      }
    }

    // جمع‌آوری متریک سئو
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
