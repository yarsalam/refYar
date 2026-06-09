import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { RevenueIntelligenceService } from './revenue-intelligence.service';

@Processor('revenue-intelligence')
@Injectable()
export class RevenueIntelligenceProcessor extends WorkerHost {
  private readonly logger = new Logger(RevenueIntelligenceProcessor.name);

  constructor(private readonly revenueService: RevenueIntelligenceService) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { metrics } = job.data;

    switch (job.name) {
      case 'seo-metrics-collected':
        await this.handleSEOMetrics(metrics);
        break;
      case 'forecast-revenue':
        await this.handleForecast(job.data);
        break;
    }
  }

  async handleSEOMetrics(metrics: any) {
    this.logger.debug('Processing SEO metrics for revenue');

    // محاسبه LTV و CAC بر اساس متریک‌های سئو
    const ltvBySource = await this.revenueService.calculateLTVBySource();

    if (!ltvBySource || Object.keys(ltvBySource).length === 0) {
      this.logger.warn('No LTV data calculated for sources');
      // می‌تونی return کنی یا ادامه بدی با object خالی
    }
    await this.revenueService.saveRevenueMetrics({
      source: 'seo',
      revenue: 0,
      cost: 0,
      metrics,
      ltvBySource,
      timestamp: new Date(),
    });
  }

  // اگر بعداً نیاز شد، اینجا پیاده‌سازی شود
  async handleForecast(data: any) {
    this.logger.debug('Handling revenue forecast job');
    // فعلاً placeholder
  }
}
