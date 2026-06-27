import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ProfileVisitor } from './entities/profile-visitor.entity';
import { User } from '../users/entities/user.entity';
import { UserEventService } from '../user-event/user-event.service';
import { VisitorInsightsDto } from './dto/visitor-insights.dto';
import { RedisService } from '../redis/redis.service';
import { RelationStatusService } from 'src/relation-status/relation-status.service';
import { RelationStatusDto } from 'src/relation-status/dto/relation-status.dto';
import { EventType } from 'src/user-event/type/event-type.enum';

@Injectable()
export class ProfileVisitorsService {
  private readonly logger = new Logger(ProfileVisitorsService.name);
  private readonly VIEW_DUPLICATE_WINDOW = 3600;

  constructor(
    @InjectRepository(ProfileVisitor)
    private readonly visitorRepo: Repository<ProfileVisitor>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly userEventService: UserEventService,
    private readonly redis: RedisService,
    private readonly relationStatus: RelationStatusService,
  ) {}

  async createVisitor(
    visitorId: number,
    profileId: number,
    metadata?: any,
  ): Promise<ProfileVisitor> {
    const recentView = await this.visitorRepo.findOne({
      where: {
        visitorId,
        profileId,
        visitedAt: MoreThan(
          new Date(Date.now() - this.VIEW_DUPLICATE_WINDOW * 1000),
        ),
      },
    });

    if (recentView) {
      recentView.visitedAt = new Date();
      recentView.metadata = { ...recentView.metadata, ...metadata };
      return this.visitorRepo.save(recentView);
    }

    const mutualView = await this.visitorRepo.findOne({
      where: { visitorId: profileId, profileId: visitorId },
    });

    const visitor = this.visitorRepo.create({
      visitorId,
      profileId,
      visitedAt: new Date(),
      viewDuration: metadata?.duration || 0,
      isMutual: !!mutualView,
      metadata: {
        source: metadata?.source || 'unknown',
        deviceType: metadata?.deviceType || 'unknown',
        previousAction: metadata?.previousAction,
      },
    });

    const saved = await this.visitorRepo.save(visitor);

    if (mutualView && !mutualView.isMutual) {
      mutualView.isMutual = true;
      await this.visitorRepo.save(mutualView);
    }

    await this.userEventService.log({
      userId: visitorId,
      type: EventType.PROFILE_VIEW,
      metadata: {
        source: metadata?.source,
        duration: metadata?.duration,
        isMutual: !!mutualView,
      },
    });

    await this.checkMonetizationTriggers(profileId, visitorId);
    return saved;
  }

  async getInsights(
    profileId: number,
    userTier: 'free' | 'premium' | 'gold',
  ): Promise<VisitorInsightsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayViews, uniqueToday] = await Promise.all([
      this.visitorRepo.count({
        where: { profileId, visitedAt: Between(today, tomorrow) },
      }),
      this.visitorRepo
        .createQueryBuilder('v')
        .where('v.profileId = :profileId', { profileId })
        .andWhere('v.visitedAt BETWEEN :start AND :end', {
          start: today,
          end: tomorrow,
        })
        .select('COUNT(DISTINCT v.visitorId)', 'count')
        .getRawOne(),
    ]);

    const insights: VisitorInsightsDto = {
      free: { todayViews, uniqueToday: parseInt(uniqueToday?.count || '0') },
      premium: null,
      gold: null,
      alerts: [],
    };

    if (userTier === 'premium' || userTier === 'gold') {
      const fullList = await this.visitorRepo.find({
        where: { profileId },
        relations: ['visitor'],
        order: { visitedAt: 'DESC' },
        take: 100,
      });

      insights.premium = {
        fullList: fullList.map((v) => ({
          visitorId: v.visitorId,
          visitorName: v.visitor?.nickname || 'کاربر',
          visitedAt: v.visitedAt,
          isMutual: v.isMutual,
        })),
        mutualCount: fullList.filter((v) => v.isMutual).length,
        repeatVisitors: await this.getRepeatVisitors(profileId),
      };
    }

    if (userTier === 'gold') {
      insights.gold = await this.getGoldInsights(profileId);
    }

    insights.alerts = await this.generateAlerts(profileId, userTier);
    return insights;
  }

  private async checkMonetizationTriggers(
    profileId: number,
    visitorId: number,
  ): Promise<void> {
    const visitor = await this.userRepo.findOne({
      where: { id: visitorId },
      select: ['tier'],
    });

    if (visitor?.tier === 'vip') {
      await Promise.all([
        this.userEventService.log({
          userId: profileId,
          type: EventType.VIP_VIEW,
          targetUserId: visitorId,
          metadata: { timestamp: new Date() },
        }),
        this.sendVipAlert(profileId, visitorId),
      ]);
    }

    const visitCount = await this.visitorRepo.count({
      where: { profileId, visitorId },
    });

    if (visitCount === 3) {
      await Promise.all([
        this.userEventService.log({
          userId: profileId,
          type: EventType.REPEAT_VIEWER,
          metadata: { count: visitCount, visitorId },
        }),
        this.offerPremium(profileId, visitorId),
      ]);
    }
  }

  @Cron('0 3 * * *')
  async cleanupOldViews() {
    this.logger.log('Cleaning up old profile views...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.visitorRepo.delete({
      visitedAt: LessThan(thirtyDaysAgo),
    });
    this.logger.log(`Cleaned up ${result.affected} old views`);
    await this.saveAggregatedStats(thirtyDaysAgo);
  }

  private async saveAggregatedStats(olderThan: Date): Promise<void> {
    // TODO: ذخیره در جدول جداگانه
  }

  private async getRepeatVisitors(profileId: number): Promise<number[]> {
    const result = await this.visitorRepo
      .createQueryBuilder('v')
      .select('v.visitorId')
      .addSelect('COUNT(*)', 'count')
      .where('v.profileId = :profileId', { profileId })
      .groupBy('v.visitorId')
      .having('COUNT(*) > 1')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return result.map((r) => r.visitorId);
  }

  private async getGoldInsights(profileId: number): Promise<any> {
    return { historicalData: [], topVisitors: [], visitorsByHour: {} };
  }

  private async generateAlerts(
    profileId: number,
    userTier: string,
  ): Promise<any[]> {
    const alerts: Array<{ type: string; message: string; priority: string }> =
      [];

    if (userTier === 'free') {
      alerts.push({
        type: 'upgrade',
        message: 'با Premium ببین کی پروفایلت رو دیده!',
        priority: 'medium',
      });
    }

    const hasVipView = await this.redis.get(`vip_view:${profileId}`);
    if (hasVipView) {
      alerts.push({
        type: 'vip',
        message: 'یک کاربر VIP پروفایل شما را دیده است!',
        priority: 'high',
      });
      await this.redis.del(`vip_view:${profileId}`);
    }

    return alerts;
  }

  private async sendVipAlert(
    profileId: number,
    visitorId: number,
  ): Promise<void> {
    // TODO: ارسال نوتیفیکیشن
    await this.redis.set(`vip_view:${profileId}`, '1', 86400);
  }

  private async offerPremium(
    profileId: number,
    visitorId: number,
  ): Promise<void> {
    // TODO: پیشنهاد Premium
  }

  async getProfileVisitors(userId: number) {
    const visitors = await this.visitorRepo.find({
      where: { profileId: userId },
      order: { createdAt: 'DESC' },
      relations: ['visitor', 'visitor.userImages'],
    });

    const visitorIds = [...new Set(visitors.map((v) => v.visitorId))];

    let relationsMap = new Map<number, RelationStatusDto>();
    try {
      relationsMap = await this.relationStatus.getEffectiveRelationsBatch(
        userId,
        visitorIds,
      );
    } catch (err: unknown) {
      this.logger.error('Failed to get relations for visitors', err);
    }

    return visitors
      .filter((v) => !relationsMap.get(v.visitorId)?.isBlocked)
      .map((v) => ({
        ...v,
        relation: relationsMap.get(v.visitorId),
      }));
  }
}
