import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AdminApiGuard } from '../../guards/api-key.guard';
import { SEOCollectorService } from '../../../seo/services/seo-collector.service';
import { SEOService } from '../../../seo/services/seo.service';
import { RevenueAttributionService } from '../../../seo/services/revenue-attribution.service';
import { SEORetentionService } from '../../../seo/services/analytics/seo-retention.service';
import { ContentOpportunityService } from '../../../seo/services/intelligence/content-opportunity.service';
import { RevenueIntelligenceService } from '../../../revenue/revenue-intelligence.service';

@Controller('admin-api/seo')
@UseGuards(AdminApiGuard)
export class AdminApiSeoController {
  private readonly logger = new Logger(AdminApiSeoController.name);
  private readonly aiSeoUrl: string;

  constructor(
    private readonly seoCollector: SEOCollectorService,
    private readonly seoRetentionService: SEORetentionService,
    private readonly seoService: SEOService,
    private readonly contentOpportunity: ContentOpportunityService,
    private readonly revenueIntelligence: RevenueIntelligenceService,
    private readonly revenueAttribution: RevenueAttributionService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.aiSeoUrl = this.config.get('AI_SEO_URL') || 'http://ai_seo:8021';
  }

  @Get('dashboard')
  async getDashboard() {
    const metrics = await this.seoCollector.collectAllMetrics();
    return metrics;
  }

  @Get('revenue-dashboard')
  async getRevenueDashboard() {
    const attribution = await this.revenueAttribution.calculateLTVBySource();
    return attribution;
  }

  @Get('behavioral-keywords')
  async getBehavioralKeywords() {
    return this.seoService.discoverBehavioralKeywords();
  }

  @Get('admin-dashboard')
  async getAdminDashboard() {
    // تجمیع داده‌ها از سرویس‌ها - هر کدوم در try/catch خودش
    const [overall, retention, keywords, opportunities, forecastResult] =
      await Promise.all([
        this.seoCollector.collectAllMetrics().catch((e) => {
          this.logger.error('collectAllMetrics failed', e);
          return null;
        }),
        this.seoRetentionService.getKeywordRetentionReport().catch((e) => {
          this.logger.error('getKeywordRetentionReport failed', e);
          return [];
        }),
        this.seoService.discoverBehavioralKeywords().catch((e) => {
          this.logger.error('discoverBehavioralKeywords failed', e);
          return [];
        }),
        this.contentOpportunity.generateHighIntentContent().catch((e) => {
          this.logger.error('generateHighIntentContent failed', e);
          return [];
        }),
        this.revenueIntelligence.forecastRevenue(90).catch((e) => {
          this.logger.error('forecastRevenue failed', e);
          return null;
        }),
      ]);

    // ۱. استخراج داده‌های کمپین و رقبا (با نام صحیح)
    const campaign = overall?.campaign; // مفرد از collector
    const competitor = overall?.competitor; // مفرد از collector

    // ۲. استخراج nextMonth از forecast آرایه‌ای
    const forecastArray = forecastResult?.forecast; // آرایه پیش‌بینی
    const nextMonthRevenue = forecastArray?.length
      ? forecastArray[0].revenue
      : 0;

    // ۳. ساخت پاسخ نهایی
    return {
      overall: {
        score: overall?.score ?? { base: 0, effective: 0, grade: 'N/A' },
        technical: {
          lcp: overall?.technical?.lcp ?? 0,
          cls: overall?.technical?.cls ?? 0,
          fid: overall?.technical?.fid ?? 0,
          mobileScore: overall?.technical?.mobileScore ?? 0,
          crawlErrors: overall?.technical?.crawlErrors ?? 0,
          brokenLinks: overall?.technical?.brokenLinks ?? 0,
        },
        campaigns: {
          totalRevenue: campaign?.totalRevenue ?? 0,
          avgROI: campaign?.avgROI ?? 0,
          growthRate: campaign?.growthRate ?? 0,
          totalSpent: campaign?.totalSpent ?? 0,
        },
        competitors: {
          threats: competitor?.threats ?? [],
        },
      },
      retentionByKeyword: retention,
      behavioralKeywords: keywords,
      contentOpportunities: opportunities,
      revenueForecast: {
        nextMonth: nextMonthRevenue,
        growthRate: forecastResult?.growthRate ?? 0,
      },
      recommendations: [],
      learnings: [],
    };
  }

  @Get('content-opportunities')
  async getContentOpportunities() {
    return this.contentOpportunity.generateHighIntentContent();
  }

  @Get('competitor-analysis')
  async getCompetitorAnalysis() {
    // موقتاً mock – بعداً می‌توان از سرویس واقعی استفاده کرد
    return [
      { competitor: 'رقیب ۱', overlap: 30, strength: ['بک‌لینک', 'سرعت'] },
      { competitor: 'رقیب ۲', overlap: 20, strength: ['محتوا'] },
    ];
  }

  // @Get('competitor-changes')
  // async getCompetitorChanges() {
  //   try {
  //     const { data } = await this.httpService.axiosRef.get(
  //       `${this.aiSeoUrl}/competitor-changes`,
  //     );
  //     return data;
  //   } catch (error: unknown) {
  //     this.logger.error('Failed to fetch competitor changes', error);
  //     return [];
  //   }
  // }

  // @Get('serp-features')
  // async getSERPFeatures(@Query('keyword') keyword: string) {
  //   try {
  //     const { data } = await this.httpService.axiosRef.get(
  //       `${this.aiSeoUrl}/serp-features?keyword=${encodeURIComponent(keyword)}`,
  //     );
  //     return data;
  //   } catch (error: unknown) {
  //     this.logger.error('Failed to fetch SERP features', error);
  //     return [];
  //   }
  // }

  // @Get('keywords-ranking')
  // async getKeywordsRanking() {
  //   return this.seoService.discoverBehavioralKeywords();
  // }
  @Get('keywords-ranking')
  async getKeywordsRanking() {
    try {
      return await this.seoService.discoverBehavioralKeywords();
    } catch (error: unknown) {
      this.logger.error('SEO keywords ranking failed, returning mock', error);
      // داده‌های Mock برای نمایش در پنل
      return [
        { keyword: 'همسریابی', position: 3, volume: 12000, trend: 'up' },
        { keyword: 'دوستیابی', position: 8, volume: 8000, trend: 'stable' },
        { keyword: 'ازدواج', position: 12, volume: 15000, trend: 'down' },
      ];
    }
  }

  @Get('competitor-changes')
  async getCompetitorChanges() {
    try {
      const { data } = await this.httpService.axiosRef.get(
        `${this.aiSeoUrl}/competitor-changes`,
      );
      return data;
    } catch (error: unknown) {
      this.logger.error('Competitor changes fetch failed', error);
      return [
        { name: 'رقیب ۱', change: '+12%' },
        { name: 'رقیب ۲', change: '-5%' },
      ];
    }
  }

  @Get('serp-features')
  async getSERPFeatures(@Query('keyword') keyword: string) {
    try {
      const { data } = await this.httpService.axiosRef.get(
        `${this.aiSeoUrl}/serp-features?keyword=${encodeURIComponent(keyword)}`,
      );
      return data;
    } catch (error: unknown) {
      this.logger.error('SERP features fetch failed', error);
      return []; // یا یک Mock مناسب
    }
  }
}
