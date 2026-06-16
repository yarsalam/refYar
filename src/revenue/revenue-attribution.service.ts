import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Payment } from 'src/payments/entities/payment.entity';
import { User } from 'src/users/entities/user.entity';
import { Repository, Between } from 'typeorm';
import { UserEventLogs } from 'src/user-event/entities/user-event.entity';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { HttpService } from '@nestjs/axios';
import { FeatureStoreService } from 'src/feature-store/feature-store.service';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SEOActivity } from 'src/seo/entities/seo-activity.entity';

export interface LTVResult {
  source: string;
  userCount: number;
  totalRevenue: number;
  ltv: number;
  cac: number;
  paybackPeriod: number;
}

const DEFAULT_SOURCE_WEIGHTS = {
  organic: 1.0,
  instagram: 1.2,
  telegram: 1.1,
  google: 1.3,
  direct: 0.9,
  referral: 1.0,
};

@Injectable()
export class RevenueAttributionService {
  private readonly logger = new Logger(RevenueAttributionService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,

    @InjectRepository(SEOActivity)
    private readonly seoActivityRepo: Repository<SEOActivity>,

    @InjectRepository(UserEventLogs)
    private readonly eventRepo: Repository<UserEventLogs>,

    @Inject(REDIS_CLIENT) private readonly redis: Redis,

    private readonly httpService: HttpService,
    private readonly featureStore: FeatureStoreService,
    private readonly configService: ConfigService,
  ) {}

  private async getSourceWeight(source: string): Promise<number> {
    const stored = await this.redis.get(`revenue:source:${source}`);
    return stored ? parseFloat(stored) : DEFAULT_SOURCE_WEIGHTS[source] || 1.0;
  }

  private async setSourceWeight(source: string, weight: number): Promise<void> {
    await this.redis.set(`revenue:source:${source}`, weight.toString());
  }

  /**
   * محاسبه LTV هر کاربر بر اساس منبع جذب
   */
  async calculateLTVBySource(days = 90): Promise<LTVResult[]> {
    const users = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.payments', 'payments')
      .leftJoinAndSelect('user.zuserEvents', 'events')
      .where('user.createdAt >= :date', {
        date: new Date(Date.now() - days * 86400000),
      })
      .getMany();

    const sources: Record<
      string,
      { users: number; revenue: number; totalWeight: number }
    > = {};

    for (const user of users) {
      const source = user.metadata?.acquisitionSource || 'organic';
      const weight = await this.getSourceWeight(source); // 🆕

      if (!sources[source]) {
        sources[source] = { users: 0, revenue: 0, totalWeight: 0 };
      }

      sources[source].users++;
      const userRevenue =
        user.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      sources[source].revenue += userRevenue;
      sources[source].totalWeight += weight;
    }

    const result: LTVResult[] = [];
    for (const [source, data] of Object.entries(sources)) {
      const cac = await this.getCACForSource(source, days);
      const avgWeight = data.users > 0 ? data.totalWeight / data.users : 1;
      const rawLTV = data.revenue / data.users;
      const adjustedLTV = rawLTV * avgWeight; // 🆕 LTV تعدیل‌شده با وزن منبع

      result.push({
        source,
        userCount: data.users,
        totalRevenue: data.revenue,
        ltv: adjustedLTV,
        cac,
        paybackPeriod: cac > 0 ? adjustedLTV / cac : 0,
      });
    }

    return result;
  }

  private async getCACForSource(source: string, days: number): Promise<number> {
    // محاسبه هزینه جذب از فعالیت‌های سئو
    const activities = await this.seoActivityRepo.find({
      where: {
        performedAt: Between(
          new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          new Date(),
        ),
        platform: source as any,
      },
    });

    const totalCost = activities.reduce((sum, a) => sum + Number(a.cost), 0);

    // تعداد کاربرانی که از این سورس اومدن
    const userCount = await this.userRepo.count({
      where: {
        metadata: {
          acquisitionSource: source,
        },
      },
    });

    return userCount > 0 ? totalCost / userCount : 0;
  }

  async adjustSourceWeight(source: string, reward: number): Promise<void> {
    const current = await this.getSourceWeight(source);
    const learningRate = 0.01;
    const newWeight = Math.max(0.1, current + learningRate * reward);
    await this.setSourceWeight(source, newWeight);

    this.logger.log(
      `Source weight "${source}" adjusted: ${current.toFixed(2)} → ${newWeight.toFixed(2)} (reward: ${reward})`,
    );
  }

  /**
   * پیش‌بینی LTV کاربر جدید
   */
  async predictLTV(userId: number): Promise<number> {
    try {
      const aiRevenueUrl = this.configService.get(
        'AI_REVENUE_URL',
        'http://ai_revenue:8006',
      );
      const features = await this.featureStore.getUserFeatures(userId);
      const response = await firstValueFrom(
        this.httpService.post(`${aiRevenueUrl}/predict/ltv`, {
          userId,
          features,
        }),
      );
      return response.data.predicted_ltv;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error('ML prediction failed, using fallback: ' + message);
      // fallback به روش قبلی
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) return 0;
      const similarUsers = await this.userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.payments', 'payments')
        .where('user.city = :city', { city: user.city })
        .andWhere('user.gender = :gender', { gender: user.gender })
        .getMany();

      if (similarUsers.length === 0) return 150; // fallback

      const totalLTV = similarUsers.reduce((sum, u) => {
        const userRevenue =
          u.payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
        return sum + userRevenue;
      }, 0);

      return totalLTV / similarUsers.length;
    }
  }
}
