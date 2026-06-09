// backend/src/admin-api/controllers/growth/seo-studio.controller.ts
import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { AdminApiGuard } from '../../guards/api-key.guard';
import { ContentOpportunityService } from '../../../seo/services/intelligence/content-opportunity.service';
import { SEOService } from '../../../seo/services/seo.service';
import { ExternalSEOToolsService } from '../../../seo/services/external-seo-tools.service';
import { SERPFeatureHunterService } from '../../../seo/services/serp-feature-hunter.service';
import { CompetitorSEOService } from '../../../seo/services/competitor-seo.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Controller('admin-api/growth/seo-studio')
@UseGuards(AdminApiGuard)
export class SeoStudioController {
  private aiSeoUrl: string;
  constructor(
    private readonly contentOpportunity: ContentOpportunityService,
    private readonly seoService: SEOService,
    private readonly externalTools: ExternalSEOToolsService,
    private readonly serpHunter: SERPFeatureHunterService,
    private readonly competitorSEO: CompetitorSEOService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.aiSeoUrl = this.config.get('AI_SEO_URL') || 'http://ai_seo:8021';
  }

  @Get('content-ideas')
  async getContentIdeas(): Promise<any[]> {
    try {
      return await this.contentOpportunity.generateContentIdeas();
    } catch {
      return [];
    }
  }

  @Get('high-intent-content')
  async getHighIntentContent() {
    try {
      return await this.contentOpportunity.generateHighIntentContent();
    } catch {
      return [];
    }
  }

  @Get('behavioral-keywords')
  async getBehavioralKeywords() {
    try {
      return await this.seoService.discoverBehavioralKeywords();
    } catch {
      return [];
    }
  }

  @Get('keyword-rankings')
  async getKeywordRankings(@Query('keyword') keyword?: string) {
    try {
      const domain = this.config.get('APP_DOMAIN') || 'yarsalam.com';
      const searchKeyword = keyword || 'default keyword';
      return await this.externalTools.getLiveSerpRanking(searchKeyword, domain);
    } catch {
      return [];
    }
  }

  @Get('serp-features')
  async getSERPFeatures(@Query('keyword') keyword: string) {
    try {
      return await this.serpHunter.huntFeatures(keyword);
    } catch {
      return [];
    }
  }

  @Get('competitor-analysis')
  async getCompetitorAnalysis() {
    try {
      return await this.competitorSEO.analyzeCompetitors();
    } catch {
      return [];
    }
  }

  @Get('competitor-changes')
  async getCompetitorChanges() {
    try {
      return await this.competitorSEO.detectCompetitorChanges();
    } catch {
      return [];
    }
  }

  @Get('ai-recommendations')
  async getAIRecommendations() {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.aiSeoUrl}/teach-admin`),
      );
      return data;
    } catch {
      return [];
    }
  }

  @Get('google-trends')
  async getGoogleTrends(
    @Query('keyword') keyword: string,
    @Query('geo') geo = 'IR',
  ) {
    try {
      return await this.externalTools.getGoogleTrends(keyword, geo);
    } catch {
      return null;
    }
  }

  @Post('keyword-gap')
  async getKeywordGap(@Body() body: { domain: string; competitors: string[] }) {
    try {
      return await this.externalTools.getKeywordGap(
        body.domain,
        body.competitors,
      );
    } catch {
      return [];
    }
  }
}
