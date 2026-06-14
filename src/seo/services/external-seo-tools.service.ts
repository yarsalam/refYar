import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { Redis } from 'ioredis';
import googleTrends from 'google-trends-api';

@Injectable()
export class ExternalSEOToolsService {
  private readonly logger = new Logger(ExternalSEOToolsService.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // 1️⃣ Google Search Console API (رایگان)
  async getSearchConsoleData(domain: string, days = 30) {
    const cacheKey = `search_console:${domain}:${days}`;

    // 1. چک کش
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. Rate limiting
    const rateKey = `rate:search_console:${domain}`;
    const calls = await this.redis.incr(rateKey);
    if (calls === 1) {
      await this.redis.expire(rateKey, 86400); // روزانه
    }

    if (calls > 100) {
      // محدودیت روزانه
      throw new Error('Rate limit exceeded');
    }

    // 3. درخواست واقعی
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`,
          {
            inspectionUrl: domain,
            siteUrl: domain,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.GOOGLE_API_KEY}`,
            },
            timeout: 10000,
          },
        ),
      );

      // 4. کش برای 1 ساعت
      await this.redis.set(cacheKey, JSON.stringify(response.data));
      await this.redis.expire(cacheKey, 3600);

      return response.data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getMocSearchConsoleData API failed: ${message}`);
      return this.getSearchConsoleData();
    }
  }

  // 2️⃣ Google Analytics 4 API (رایگان)
  async getAnalyticsData(propertyId: string, days = 30) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
            metrics: [
              { name: 'screenPageViews' },
              { name: 'totalUsers' },
              { name: 'averageSessionDuration' },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.GOOGLE_API_KEY}`,
            },
            timeout: 10000,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getAnalyticsData API failed: ${message}`);
      return this.getAnalyticsData();
    }
  }

  // 3️⃣ Backlink Checker (رایگان - نمونه)
  async getBacklinkData(domain: string) {
    try {
      // استفاده از API رایگان backlinkwatch.com
      const response = await firstValueFrom(
        this.httpService.get(
          `https://api.backlinkwatch.com/v2/?url=${domain}&mode=domain`,
          {
            headers: {
              'x-api-key': process.env.BACKLINK_API_KEY,
            },
            timeout: 10000,
          },
        ),
      );

      return {
        totalBacklinks: response.data.total_backlinks || 0,
        referringDomains: response.data.ref_domains || 0,
        dofollow: response.data.dofollow || 0,
        nofollow: response.data.nofollow || 0,
        topDomains: response.data.top_domains?.slice(0, 10) || [],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getMockBacklinjData API failed: ${message}`);
      return this.getBacklinkData();
    }
  }

  // 4️⃣ Moz API (بخش رایگان - 100 داده اول)
  async getMozData(domain: string) {
    try {
      // Moz API - 100 درخواست رایگان در ماه
      const auth = Buffer.from(
        `${process.env.MOZ_ACCESS_ID}:${process.env.MOZ_SECRET_KEY}`,
      ).toString('base64');

      const response = await firstValueFrom(
        this.httpService.post(
          'https://lsapi.seomoz.com/v2/url_metrics',
          {
            targets: [domain],
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        ),
      );

      return {
        domainAuthority: response.data[0]?.domain_authority || 0,
        pageAuthority: response.data[0]?.page_authority || 0,
        spamScore: response.data[0]?.spam_score || 0,
        linkingDomains: response.data[0]?.linking_domains || 0,
        backlinks: response.data[0]?.backlinks || 0,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getMockMozData API failed: ${message}`);
      return this.getMockMozData();
    }
  }

  // 5️⃣ SEMrush API (محدود)
  async getSemrushData(domain: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://api.semrush.com/`, {
          params: {
            type: 'domain_rank',
            key: process.env.SEMRUSH_API_KEY,
            domain: domain,
            database: 'us',
          },
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getSemrushData API failed: ${message}`);
      return this.getSemrushData();
    }
  }

  // 6️⃣ Ahrefs-like رایگان (backlinkwatch)
  async getBacklinkWatchData(domain: string) {
    try {
      // backlinkwatch.com API رایگان
      const response = await firstValueFrom(
        this.httpService.get(
          `https://api.backlinkwatch.com/v1/?url=${domain}&mode=domain`,
          {
            headers: {
              'x-api-key': process.env.BACKLINK_API_KEY,
            },
            timeout: 10000,
          },
        ),
      );

      return {
        backlinks: response.data.total_backlinks || 0,
        referringDomains: response.data.ref_domains || 0,
        dofollow: response.data.dofollow || 0,
        nofollow: response.data.nofollow || 0,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getMockBacklinkWatchData API failed: ${message}`);
      return this.getBacklinkWatchData();
    }
  }

  // 7️⃣ RivalSee (ابزار جدید AI SEO)
  async getRivalSeeData(domain: string) {
    // TODO: اضافه کردن API RivalSee
    return this.getMockCompetitorData();
  }

  // 8️⃣ Appark (تحلیل رقبا)
  async getApparkData(appName: string) {
    // TODO: اضافه کردن API Appark
    return this.getMockCompetitorData();
  }

  // 9️⃣ DeepSeek (ردیابی رتبه)
  async getDeepSeekRankings(keyword: string) {
    // TODO: اضافه کردن API DeepSeek
    return {
      keyword,
      position: Math.floor(Math.random() * 50) + 1,
      searchVolume: Math.floor(Math.random() * 10000),
    };
  }

  // ========== Mock Data (برای وقتی API در دسترس نیست) ==========
  private getMockBacklinkData() {
    return {
      totalBacklinks: 1245,
      referringDomains: 87,
      dofollow: 890,
      nofollow: 355,
      topDomains: [
        'instagram.com',
        'linkedin.com',
        'medium.com',
        'quora.com',
        'twitter.com',
      ],
    };
  }

  private getMockMozData() {
    return {
      domainAuthority: 45,
      pageAuthority: 38,
      spamScore: 2,
      linkingDomains: 156,
      backlinks: 2345,
    };
  }

  private getMockSearchConsoleData() {
    return {
      clicks: 12500,
      impressions: 245000,
      ctr: 0.051,
      position: 12.5,
      topQueries: ['همسریابی', 'دوستیابی', 'ازدواج آسان'],
    };
  }

  private getMockAnalyticsData() {
    return {
      users: 15000,
      sessions: 23000,
      pageViews: 89000,
      avgSessionDuration: 245,
      bounceRate: 42,
    };
  }

  private getMockSemrushData() {
    return {
      organic_keywords: 1250,
      organic_traffic: 34500,
      paid_keywords: 45,
      paid_traffic: 2300,
    };
  }

  private getMockCompetitorData() {
    return {
      competitors: [
        { name: 'همدم', traffic: 25000, da: 52 },
        { name: 'همسان', traffic: 18000, da: 48 },
        { name: 'پیوند', traffic: 12000, da: 41 },
      ],
      opportunities: [
        'کلمات کلیدی: همسریابی آنلاین',
        'بک‌لینک از سایت‌های خبری',
      ],
    };
  }

  async getKeywordDifficulty(keyword: string): Promise<number> {
    return 0;
  }

  async getGoogleTrends(keyword: string, geo: string = 'IR'): Promise<any> {
    try {
      // استفاده از کش برای جلوگیری از Rate Limit
      const cacheKey = `trends:${keyword}:${geo}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      const results = await googleTrends.interestOverTime({
        keyword: keyword,
        geo: geo,
        hl: 'fa',
      });

      await this.redis.set(cacheKey, results, 'EX', 86400); // 1 روز کش
      return JSON.parse(results);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getGoogleTrends API failed: ${message}`);
      return this.getGoogleTrends();
    }
  }

  /**
   * 🚀 اصلاح شده: دریافت رتبه واقعی از SerpAPI (Accounts رایگان دارد)
   */
  async getLiveSerpRanking(keyword: string, domain: string): Promise<any> {
    try {
      const cacheKey = `serp:${keyword}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      const apiKey = process.env.SERPAPI_KEY;
      if (!apiKey) {
        this.logger.warn('SERPAPI_KEY not set, using mock data');
        return this.getMockSerpData();
      }

      const response = await firstValueFrom(
        this.httpService.get(`https://serpapi.com/search.json`, {
          params: {
            q: keyword,
            api_key: apiKey,
            gl: 'ir',
            hl: 'fa',
            num: 20,
          },
        }),
      );

      const data = response.data;
      const position = data.organic_results?.findIndex((r) =>
        r.link?.includes(domain),
      );

      const result = {
        position: position !== -1 ? position + 1 : 50,
        totalResults: data.search_information?.total_results,
        topDomains: data.organic_results?.map((r) => r.link).slice(0, 5),
      };

      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`XXX API failed: ${message}`);
      return this.getLiveSerpRanking();
    }
  }

  async getKeywordGap(domain: string, competitors: string[]): Promise<any> {
    const keywords = ['همسریابی', 'دوستیابی', 'ازدواج'];
    const result = {};

    for (const kw of keywords) {
      const ourRank = await this.getLiveSerpRanking(kw, domain);
      result[kw] = { ourPosition: ourRank?.position };

      for (const comp of competitors) {
        const compRank = await this.getLiveSerpRanking(kw, comp);
        result[kw][comp] = compRank?.position;
      }
    }

    return result;
  }

  private getMockSerpData() {
    return { position: 50, totalResults: 0, topDomains: [] };
  }
}
