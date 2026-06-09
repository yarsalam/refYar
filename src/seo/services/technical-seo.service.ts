import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SEOMetrics } from '../entities/seo-metrics.entity';

@Injectable()
export class TechnicalSEOService {
  private readonly logger = new Logger(TechnicalSEOService.name);

  constructor(
    @InjectRepository(SEOMetrics)
    private readonly metricsRepo: Repository<SEOMetrics>,
    private readonly httpService: HttpService,
  ) {}

  async analyzeTechnicalSEO() {
    try {
      // 1. Core Web Vitals از PageSpeed Insights
      const pagespeed = await this.getPageSpeedMetrics();

      // 2. Crawl errors از Search Console
      const crawlErrors = await this.getCrawlErrors();

      // 3. Broken links
      const brokenLinks = await this.checkBrokenLinks();

      // 4. Mobile friendliness
      const mobileScore = await this.checkMobileFriendliness();

      const metrics = {
        lcp: pagespeed.lcp,
        fid: pagespeed.fid,
        cls: pagespeed.cls,
        ttfb: pagespeed.ttfb,
        crawlErrors: crawlErrors.total,
        brokenLinks: brokenLinks.count,
        mobileScore,
        timestamp: new Date(),
      };

      // ذخیره در دیتابیس
      await this.metricsRepo.save({
        metricDate: new Date(),
        type: 'technical',
        data: metrics,
        score: this.calculateTechnicalScore(metrics),
      });

      return metrics;
    } catch (error) {
      this.logger.error(`Technical SEO analysis failed: ${error.message}`);
      return null;
    }
  }

  private async getPageSpeedMetrics() {
    try {
      const url = process.env.APP_URL || 'https://yourapp.com';
      const response = await firstValueFrom(
        this.httpService.get(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${url}&strategy=mobile`,
        ),
      );

      const audits = response.data.lighthouseResult.audits;

      return {
        lcp: audits['largest-contentful-paint'].numericValue / 1000, // به ثانیه
        fid: audits['max-potential-fid'].numericValue,
        cls: audits['cumulative-layout-shift'].numericValue,
        ttfb: audits['server-response-time'].numericValue,
      };
    } catch {
      // Fallback به مقادیر پیش‌فرض
      return { lcp: 2.5, fid: 100, cls: 0.1, ttfb: 200 };
    }
  }

  private async getCrawlErrors() {
    // TODO: اتصال به Google Search Console API
    return { total: 0, errors: [] };
  }

  private async checkBrokenLinks() {
    // TODO: بررسی لینک‌های شکسته
    return { count: 0, links: [] };
  }

  private async checkMobileFriendliness() {
    // TODO: بررسی mobile-friendliness
    return 95;
  }

  private calculateTechnicalScore(metrics: any): number {
    let score = 100;

    if (metrics.lcp > 2.5) score -= 10;
    if (metrics.lcp > 4) score -= 15;
    if (metrics.fid > 100) score -= 10;
    if (metrics.cls > 0.1) score -= 10;
    if (metrics.crawlErrors > 0) score -= metrics.crawlErrors * 2;
    if (metrics.brokenLinks > 0) score -= metrics.brokenLinks * 5;

    return Math.max(0, score);
  }
}
