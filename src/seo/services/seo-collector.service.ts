import { Injectable, Logger } from '@nestjs/common';
import { TechnicalSEOService } from './technical-seo.service';
import { UserSEOSignalsService } from './user-seo-signals.service';
import { CampaignSEOService } from './campaign-seo.service';
import { CompetitorSEOService } from './competitor-seo.service';
import { SEOScoreEngine } from './seo-score-engine.service';

@Injectable()
export class SEOCollectorService {
  private readonly logger = new Logger(SEOCollectorService.name);

  constructor(
    private readonly technicalService: TechnicalSEOService,
    private readonly userService: UserSEOSignalsService,
    private readonly campaignService: CampaignSEOService,
    private readonly competitorService: CompetitorSEOService,
    private readonly scoreEngine: SEOScoreEngine,
  ) {}

  async collectAllMetrics() {
    try {
      const [technical, user, campaign, competitor] = await Promise.all([
        this.technicalService.analyzeTechnicalSEO(),
        this.userService.analyzeUserSignals(),
        this.campaignService.analyzeCampaigns(),
        this.competitorService.analyzeCompetitors(),
      ]);

      const score = this.scoreEngine.calculateOverallScore({
        technical,
        user,
        campaign,
        competitor,
      });

      return {
        technical,
        user,
        campaign,
        competitor,
        score,
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Competitor analysis failed: ${message}`);
      return this.collectAllMetrics();
    }
  }

  async collectFeedMetrics(userId: number, feedLength: number) {
    // لاگ برای تحلیل سئو
    this.logger.debug(`Feed metrics for user ${userId}: ${feedLength} items`);
    // TODO: ذخیره در دیتابیس
    return Promise.resolve();
  }
}
