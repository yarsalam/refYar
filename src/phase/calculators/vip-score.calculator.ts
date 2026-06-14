import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEventLogs } from '../../user-event/entities/user-event.entity';
import { Message } from '../../message/entities/message.entity';
import { InteractionsService } from '../../interaction/interaction.service';
import { GuidanceGeneratorService } from '../../ai-assistant/guidance/guidance-generator.service';
import { UserMetricsService } from '../../user-metrics/user-metrics.service';

@Injectable()
export class VipScoreCalculator {
  constructor(
    @InjectRepository(UserEventLogs)
    private readonly eventRepo: Repository<UserEventLogs>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly interactionsService: InteractionsService,
    private readonly guidanceService: GuidanceGeneratorService,
    private readonly metricsService: UserMetricsService,
  ) {}

  async calculateLearningScore(userId: number): Promise<number> {
    const [events, interactions, messages] = await Promise.all([
      this.eventRepo.find({ where: { userId }, take: 100 }),
      this.interactionsService.getUserInteractions(userId),
      this.messageRepo.find({
        where: { from_id: userId },
        order: { created_at: 'DESC' },
        take: 200,
      }),
    ]);

    const usedFeatures = new Set(events.map((e) => e.type));
    const featureDiversity = Math.min(usedFeatures.size / 10, 1) * 100;

    const likes = interactions.filter((i) => i.type === 'like').length;
    const matches = interactions.filter((i) => i.type === 'match').length;
    const likeToMatchRate = likes > 0 ? (matches / likes) * 100 : 0;

    const totalLength = messages.reduce(
      (sum, m) => sum + (m.content?.length ?? 0),
      0,
    );
    const avgLength = messages.length > 0 ? totalLength / messages.length : 0;
    const messageDepth = Math.min((avgLength / 100) * 100, 100);

    const guidanceCompletion =
      await this.guidanceService.getCompletionRate(userId);
    const slope = await this.metricsService.getEngagementSlope(userId);

    const learningScore =
      featureDiversity * 0.25 +
      likeToMatchRate * 0.25 +
      messageDepth * 0.2 +
      guidanceCompletion * 0.2 +
      slope * 0.1;

    return Math.round(learningScore * 100) / 100;
  }

  async getProfileCompleteness(userId: number): Promise<number> {
    // همان placeholder اصلی
    return 0.7; // TODO: از ProblemDetectorService
  }

  async getSentimentScore(userId: number): Promise<number> {
    // همان placeholder اصلی
    return 0.5; // TODO: از PersonalityService
  }

  async calculateVipScores(
    userId: number,
    weights: any,
  ): Promise<{ learning: number; profile: number; sentiment: number }> {
    const [learningScore, profileCompleteness, sentimentScore] =
      await Promise.all([
        this.calculateLearningScore(userId),
        this.getProfileCompleteness(userId),
        this.getSentimentScore(userId),
      ]);
    return {
      learning: learningScore * (weights.learningScore || 0),
      profile: profileCompleteness * (weights.profileCompleteness || 0),
      sentiment: sentimentScore * (weights.sentimentScore || 0),
    };
  }
}
