import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SEOScoreEngine {
  private readonly logger = new Logger(SEOScoreEngine.name);

  constructor() {}

  // اصلاح SEOScoreEngine
  calculateOverallScore(metrics: any) {
    const scores = {
      technical: this.calculateTechnicalScore(metrics.technical),
      user: this.calculateUserScore(metrics.user),
      campaign: this.calculateCampaignScore(metrics.campaign),
      competitor: this.calculateCompetitorScore(metrics.competitor),
    };

    const weights = {
      technical: 0.3,
      user: 0.3,
      campaign: 0.2,
      competitor: 0.2,
    };

    const baseScore = Object.keys(weights).reduce(
      (sum, key) => sum + (scores[key] || 0) * weights[key],
      0,
    );

    const revenueMultiplier = this.calculateRevenueMultiplier(metrics.revenue);
    const effectiveScore = baseScore * revenueMultiplier;

    return {
      base: Math.round(baseScore),
      effective: Math.round(effectiveScore),
      breakdown: scores,
      revenueMultiplier,
      grade: this.getGrade(effectiveScore),
      recommendations: [
        { title: '...', priority: 'high', impact: '+20%' },
        // ...
      ],
    };
  }

  private calculateRevenueMultiplier(revenueData: any): number {
    if (!revenueData) return 1;

    const growthRate = revenueData.growthRate || 0;
    const roi = revenueData.roi || 1;

    // رشد خوب = ضریب بالاتر
    if (growthRate > 0.2 && roi > 2) return 1.2;
    if (growthRate > 0.1 && roi > 1.5) return 1.1;
    if (growthRate < -0.1) return 0.8;

    return 1;
  }

  private calculateTechnicalScore(metrics: any): number {
    let score = 100;
    if (metrics?.lcp > 2.5) score -= 10;
    if (metrics?.fid > 100) score -= 10;
    if (metrics?.cls > 0.1) score -= 10;
    if (metrics?.crawlErrors > 0) score -= metrics.crawlErrors * 2;
    return Math.max(0, score);
  }

  private calculateUserScore(metrics: any): number {
    let score = 0;
    if (metrics?.engagementRate > 0.3) score += 30;
    if (metrics?.returnRate > 0.4) score += 25;
    if (metrics?.topCities?.length > 5) score += 20;
    if (metrics?.underservedCities?.length > 2) score += 15;
    return Math.min(100, score);
  }

  private calculateCampaignScore(metrics: any): number {
    if (!metrics?.avgROI) return 50;

    // ROI بالای ۲۰۰٪ = نمره عالی
    const roiScore = Math.min(100, metrics.avgROI);

    // تنوع پلتفرم
    const platformCount = Object.keys(metrics.byPlatform || {}).length;
    const diversityScore = Math.min(20, platformCount * 5);

    // ثبات
    const consistencyScore = metrics.campaigns?.length > 5 ? 15 : 5;

    return Math.min(100, roiScore * 0.7 + diversityScore + consistencyScore);
  }

  private calculateCompetitorScore(metrics: any): number {
    if (!metrics?.threats) return 50;
    const highThreats = metrics.threats.filter(
      (t) => t.threatLevel === 'high',
    ).length;
    return Math.max(0, 100 - highThreats * 20);
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }
}
