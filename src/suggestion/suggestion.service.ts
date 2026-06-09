import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { InteractionsService } from 'src/interaction/interaction.service';
import { UserEventService } from 'src/user-event/user-event.service';
import { EventType } from 'src/user-event/entities/user-event.entity';
import { VectorSearchService } from './retrieval/vector-search.service';
import { RevenueScorerService } from './scoring/revenue-scorer.service';
import { DiversityOptimizerService } from './optimization/diversity-optimizer.service';
import { SuggestionEntity } from './entities/suggestion.entity';
import { RelationStatusService } from 'src/relation-status/relation-status.service';

@Injectable()
export class SuggestionService {
  private readonly logger = new Logger(SuggestionService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly interactionsService: InteractionsService,
    private readonly userEventService: UserEventService,
    private readonly vectorSearch: VectorSearchService,
    private readonly revenueScorer: RevenueScorerService,
    private readonly diversityOptimizer: DiversityOptimizerService,
    private readonly relationStatus: RelationStatusService,
  ) {}

  async getSuggestionsForUser(
    userId: number,
    opts?: { limit?: number; city?: string },
  ) {
    const limit = opts?.limit ?? 20;
    const startTime = Date.now();

    // 1. دریافت کاندیداها با vector search (۲۰۰ تا)
    const candidates = await this.vectorSearch.findCandidates(userId, 200);
    if (candidates.length === 0) {
      return [];
    }

    // 2. امتیازدهی دسته‌ای با expected revenue
    const scores = await this.revenueScorer.scoreBatch(userId, candidates);
    // 3. دریافت تعداد تعاملات کاربر برای epsilon
    const interactions =
      await this.interactionsService.getUserInteractions(userId);
    const epsilon = this.diversityOptimizer.getAdaptiveEpsilon(
      interactions.length,
    );

    // 4. Exploration vs Exploitation
    let finalCandidates = scores;
    if (Math.random() < epsilon) {
      // Exploration: shuffle با وزن
      finalCandidates = this.diversityOptimizer.exploreExploit(scores);
    }

    // 5. بهینه‌سازی تنوع با MMR
    const optimized = await this.diversityOptimizer.optimizeWithMMR(
      finalCandidates.map((s) => ({
        id: s.candidateId,
        score: s.expectedRevenue,
        features: {
          // ویژگی‌ها از feature store
        },
      })),
      limit,
    );
    // 6. دریافت اطلاعات کامل کاربران
    const result = await this.enrichResults(
      userId,
      optimized.map((o) => Number(o.id)),
    );

    // 7. لاگ غیرهمزمان (بدون await)
    this.userEventService
      .log({
        userId,
        type: EventType.AI_SUGGESTION_SHOWN,
        metadata: {
          count: result.length,
          scores: result.map((r) => r.score),
          duration: Date.now() - startTime,
        },
      })
      .catch((err) => this.logger.error('Failed to log', err));

    return result;
  }

  private async enrichResults(
    userId: number,
    candidateIds: number[],
  ): Promise<any[]> {
    if (candidateIds.length === 0) return [];

    const users = await this.usersService.findByIds(candidateIds, {
      relations: ['userImages', 'boost', 'devices'],
      select: [
        'id',
        'nickname',
        'city',
        'gender',
        'birth_year',
        'aboutme',
        'hobbies_self',
        'values_self',
        'isFaceVerified',
        'trustScore',
      ],
    });

    const scores = await this.revenueScorer.scoreBatch(userId, candidateIds);
    const scoreMap = new Map(scores.map((s) => [s.candidateId, s]));
    // 🆕 دریافت وضعیت روابط
    const relationsMap = await this.relationStatus.getEffectiveRelationsBatch(
      userId,
      candidateIds,
    );
    return users
      .map((user) => {
        const rel = relationsMap.get(user.id);
        if (rel?.isBlocked) return null; // حذف بلاک‌شده‌ها

        const score = scoreMap.get(user.id);
        return {
          ...SuggestionEntity.fromUser(user, score?.expectedRevenue || 0),
          compatibilityScore: Math.round((score?.expectedRevenue || 0) * 100),
          isOnline: user.devices?.some((d) => d.isOnline) ?? false,
          avatar: user.userImages?.find((img) => img.isMain)?.url || null,
          relation: rel, // 🆕
        };
      })
      .filter(Boolean);
  }
}
