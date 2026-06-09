import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEventService } from '../../user-event/user-event.service';
import { PhaseService } from '../../phase/phase.service';
import { UserMetricsService } from '../../user-metrics/user-metrics.service';
import { SEOMetrics } from '../entities/seo-metrics.entity';
import { InteractionsService } from 'src/interaction/interaction.service';

@Injectable()
export class UserSEOSignalsService {
  private readonly logger = new Logger(UserSEOSignalsService.name);

  constructor(
    @InjectRepository(SEOMetrics)
    private readonly metricsRepo: Repository<SEOMetrics>, // ✅ دکوراتور صحیح

    @Inject(forwardRef(() => PhaseService))
    private readonly phaseService: PhaseService,

    private readonly userEventService: UserEventService,
    private readonly metricsService: UserMetricsService,
    private readonly interactionsService: InteractionsService,
  ) {}

  async analyzeUserSignals() {
    try {
      // 1. دریافت توزیع جغرافیایی
      const geographicData = await this.getGeographicDistribution();

      // 2. دریافت سیگنال‌های تعامل
      const engagementSignals = await this.getEngagementSignals();

      // 3. دریافت سیگنال‌های محتوا
      const contentSignals = await this.getContentSignals();

      const signals = {
        topCities: geographicData.topCities,
        underservedCities: geographicData.underservedCities,
        engagementRate: engagementSignals.rate,
        returnRate: engagementSignals.returnRate,
        popularHobbies: contentSignals.popularHobbies,
        successfulValues: contentSignals.successfulValues,
        timestamp: new Date(),
      };

      // ذخیره در دیتابیس
      await this.metricsRepo.save({
        metricDate: new Date(),
        type: 'user',
        data: signals,
        score: this.calculateUserScore(signals),
      });

      return signals;
    } catch (error) {
      this.logger.error(`User signals analysis failed: ${error.message}`);
      return null;
    }
  }

  private async getGeographicDistribution() {
    // TODO: از UserDeviceService و UserEventService
    return {
      topCities: [
        { city: 'تهران', count: 1500, growth: '+15%' },
        { city: 'مشهد', count: 800, growth: '+8%' },
        { city: 'اصفهان', count: 600, growth: '+12%' },
      ],
      underservedCities: [
        { city: 'کرمانشاه', potential: '+40%' },
        { city: 'تبریز', potential: '+35%' },
      ],
    };
  }

  private async getEngagementSignals() {
    // TODO: از UserMetricsService
    return {
      rate: 0.35,
      returnRate: 0.45,
      avgSessionTime: 420, // ثانیه
    };
  }

  private async getContentSignals() {
    // TODO: از InteractionsService
    return {
      popularHobbies: [
        { hobby: 'کتاب‌خوانی', score: 0.8 },
        { hobby: 'ورزش', score: 0.75 },
      ],
      successfulValues: [
        { value: 'صداقت', matchRate: 0.9 },
        { value: 'مهربانی', matchRate: 0.85 },
      ],
    };
  }

  private calculateUserScore(signals: any): number {
    let score = 0;

    // تنوع جغرافیایی
    score += signals.topCities.length * 5;
    score += signals.underservedCities.length * 3;

    // نرخ تعامل
    score += signals.engagementRate * 30;
    score += signals.returnRate * 25;

    return Math.min(100, score);
  }
}
