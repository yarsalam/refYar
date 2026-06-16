import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminApiGuard } from '../../guards/api-key.guard';
import { RevenueIntelligenceService } from '../../../revenue/revenue-intelligence.service';
import { RevenueAttributionService } from 'src/revenue/revenue-attribution.service';

@Controller('admin-api/revenue')
@UseGuards(AdminApiGuard)
export class AdminApiRevenueController {
  constructor(
    private readonly revenueAttribution: RevenueAttributionService,
    private readonly revenueIntelligence: RevenueIntelligenceService,
  ) {}

  @Get('ltv-by-source')
  async ltvBySource() {
    return this.revenueAttribution.calculateLTVBySource();
  }

  @Get('monthly')
  async monthly() {
    // اگر RevenueIntelligenceService متد monthlyRevenue داشته باشد:
    // return this.revenueIntelligence.monthlyRevenue();
    // در غیر این صورت mock:
    return [
      { month: 'فروردین', amount: 12000000 },
      { month: 'اردیبهشت', amount: 15000000 },
      { month: 'خرداد', amount: 17000000 },
    ];
  }

  @Get('historical')
  async historical() {
    // داده‌های تاریخی برای پیش‌بینی
    // return this.revenueIntelligence.getHistoricalData(); // باید پیاده‌سازی شود
    return [];
  }

  @Get('forecast')
  async forecast(@Query('days') days = 90) {
    return this.revenueIntelligence.forecastRevenue(days);
  }

  @Get('anomalies')
  async anomalies() {
    // در صورت وجود متد در revenueIntelligence
    // return this.revenueIntelligence.getAnomalies();
    // یا mock:
    return [];
  }

  @Get('strategic-decisions')
  async strategicDecisions() {
    // return this.revenueIntelligence.getStrategicDecisions();
    // mock:
    return [{ title: 'تغییر قیمت طرح premium', impact: '+3% درآمد' }];
  }
}
