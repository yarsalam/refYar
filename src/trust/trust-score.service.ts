import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserEventService } from '../user-event/user-event.service';
import { EventType } from '../user-event/entities/user-event.entity';
import { ReportBlockService } from '../report-block/report-block.service';

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @Inject(forwardRef(() => ReportBlockService))
    private readonly reportService: ReportBlockService,

    private readonly userEventService: UserEventService,
  ) {}

  /**
   * محاسبه امتیاز اعتماد کاربر
   */
  async calculateTrustScore(userId: number): Promise<number> {
    let score = 50; // امتیاز پایه

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['phones', 'userImages'],
    });

    if (!user) return 0;

    // 1. تأیید شماره تلفن
    if (user.phones?.some((p) => p.isVerified)) {
      score += 10;
    }

    // 2. تعداد عکس
    const images = user.userImages ?? [];

    if (images.length >= 3) {
      score += 10;
    } else if (images.length > 0) {
      score += 5;
    }

    // 3. تأیید چهره (اختیاری)
    if (user.isVerified) {
      score += 20;
    }

    // 4. سن اکانت
    const accountAge = Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    score += Math.min(10, accountAge / 10);

    // 5. گزارش‌ها
    const reports = await this.reportService.getReportsAgainst(userId);
    score -= reports.length * 5;

    // 6. رفتار (از UserEvent)
    const events = await this.userEventService.getUserEvents(userId, {
      limit: 100,
    });
    const positiveEvents = events.filter((e) =>
      [EventType.LIKE, EventType.MESSAGE_SENT, EventType.MATCH].includes(
        e.type,
      ),
    ).length;

    score += Math.min(15, positiveEvents / 10);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * استفاده در Suggestion - کاربران با Trust بالاتر優先 نمایش
   */
  async getWeightedSuggestions(userId: number, candidates: any[]) {
    return candidates.map((c) => ({
      ...c,
      trustScore: c.user?.trustScore || 50,
      finalScore: c.score * (1 + (c.user?.trustScore || 50) / 100),
    }));
  }

  /**
   * استفاده در Boost - کاربران معتبر بیشتر دیده می‌شن
   */
  async applyTrustToBoost(
    userId: number,
    boostFactor: number,
  ): Promise<number> {
    const trustScore = await this.calculateTrustScore(userId);
    // اعتماد بالا = تأثیر بیشتر
    return boostFactor * (1 + trustScore / 100);
  }

  /**
   * استفاده در SEO - کاربران معتبر محتوای بهتری تولید می‌کنن
   */
  async getSEOBenefit(userId: number): Promise<number> {
    const trustScore = await this.calculateTrustScore(userId);
    if (trustScore > 80) return 1.5; // ۵۰٪ بیشتر
    if (trustScore > 50) return 1.2; // ۲۰٪ بیشتر
    return 1;
  }

  async shouldAutoBlock(userId: number): Promise<boolean> {
    return false;
  }
}
