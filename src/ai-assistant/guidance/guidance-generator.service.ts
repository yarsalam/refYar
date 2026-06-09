import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ProblemDetectorService,
  UserProblem,
} from '../analyzers/problem-detector.service';
import { PhaseService } from '../../phase/phase.service';
import { UserEventService } from '../../user-event/user-event.service';
import { EventType } from '../../user-event/entities/user-event.entity';

export interface Guidance {
  id: string;
  userId: number;
  timestamp: Date;
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: {
    type: 'navigate' | 'show_tip' | 'send_notification' | 'offer_discount';
    target?: string;
    data?: any;
  };
  category: string;
  expiresAt?: Date;
}

@Injectable()
export class GuidanceGeneratorService {
  private readonly logger = new Logger(GuidanceGeneratorService.name);

  constructor(
    @Inject(forwardRef(() => PhaseService))
    private readonly phaseService: PhaseService,
    private readonly problemDetector: ProblemDetectorService,
    private readonly userEventService: UserEventService,
  ) {}

  async generateGuidance(userId: number): Promise<Guidance[]> {
    const problems = await this.problemDetector.detectProblems(userId);
    const phase = await this.phaseService.getPhaseMetrics(userId);

    const guidanceList: Guidance[] = [];

    for (const problem of problems) {
      if (phase.phase === 'cold' && problem.category === 'payment') {
        continue;
      }
      const guidance = this.problemToGuidance(userId, problem, phase);
      guidanceList.push(guidance);
    }

    const prioritized = this.prioritizeGuidance(guidanceList, phase);

    await this.userEventService.log({
      userId,
      type: EventType.GUIDANCE_GENERATED,
      metadata: {
        count: guidanceList.length,
        phase: phase.phase,
      },
    });

    return prioritized;
  }

  private problemToGuidance(
    userId: number,
    problem: UserProblem,
    phase: any,
  ): Guidance {
    const priorityMap: Record<
      UserProblem['severity'],
      'high' | 'medium' | 'low'
    > = {
      critical: 'high',
      high: 'high',
      medium: 'medium',
      low: 'low',
    };

    let action: any = { type: 'show_tip' };

    switch (problem.category) {
      case 'profile':
      case 'image':
        action = {
          type: 'navigate',
          target: 'EditProfile',
          data: { focus: problem.category },
        };
        break;

      case 'payment':
        action = {
          type: 'offer_discount',
          data: {
            product: problem.category === 'payment' ? 'credits' : 'vip',
            discount: phase.phase === 'hot' ? 20 : 0,
          },
        };
        break;

      case 'engagement':
        action = {
          type: 'navigate',
          target: 'Feed',
          data: { showSuggestions: true },
        };
        break;
    }

    const message = this.createMessage(problem);

    return {
      id: `guidance-${userId}-${Date.now()}-${Math.random()}`,
      userId,
      timestamp: new Date(),
      priority: priorityMap[problem.severity],
      message,
      action,
      category: problem.category,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  private createMessage(problem: UserProblem): string {
    const templates = {
      profile: {
        incomplete: '🚀 پروفایلت ناقصه! با تکمیلش {}',
        no_city: '📍 شهرت رو اضافه کن تا با همشهری‌ها آشنا شی',
        short_bio: '📝 درباره‌ات رو بیشتر بنویس، {}',
      },
      image: {
        no_image: '📸 عکس نداری! ۱۰ برابر کمتر دیده می‌شی',
        few_images: '🖼️ فقط {} عکس داری، حداقل ۳ تا بذار',
        low_quality: '🔍 کیفیت عکس‌هات پایینه، عکس‌های واضح‌تر بذار',
      },
      engagement: {
        low_likes: '❤️ فقط {} لایک! روزانه ۵ نفر رو لایک کن',
        no_messages: '💬 هنوز پیامی نفرستادی! با ۳ نفر شروع کن',
        low_conversion: '📊 بازدید به لایک کمه، عکس اصلی رو عوض کن',
      },
      personality: {
        negative: '😊 با لحن مهربان‌تر صحبت کن، جواب بهتری می‌گیری',
        shy: '😌 خجالتی نباش! با یه "سلام" ساده شروع کن',
      },
      payment: {
        first_time: '🎁 اولین خریدت با ۳۰٪ تخفیف',
        reminder: '⏰ مدینه خریدی نکردی؟ ۲۰٪ تخفیف ویژه',
      },
    };

    if (problem.category === 'profile') {
      if (problem.description.includes('ناقص')) {
        return templates.profile.incomplete.replace('{}', problem.impact);
      }
      if (problem.description.includes('شهر')) {
        return templates.profile.no_city;
      }
      if (problem.description.includes('کوتاه')) {
        return templates.profile.short_bio.replace('{}', problem.impact);
      }
    }

    if (problem.category === 'image') {
      if (problem.description.includes('هیچ عکسی')) {
        return templates.image.no_image;
      }
      if (problem.description.includes('کم است')) {
        return templates.image.few_images.replace('{}', '۲');
      }
      if (problem.description.includes('کیفیت')) {
        return templates.image.low_quality;
      }
    }

    if (problem.category === 'engagement') {
      if (problem.description.includes('لایک کافی')) {
        return templates.engagement.low_likes.replace('{}', '۴');
      }
      if (problem.description.includes('هیچ پیامی')) {
        return templates.engagement.no_messages;
      }
      if (problem.description.includes('نرخ تبدیل')) {
        return templates.engagement.low_conversion;
      }
    }

    return problem.description;
  }

  private prioritizeGuidance(guidanceList: Guidance[], phase: any): Guidance[] {
    const priorityOrder = {
      cold: ['profile', 'image', 'engagement', 'personality', 'payment'],
      warm: ['engagement', 'payment', 'profile', 'image', 'personality'],
      hot: ['payment', 'engagement', 'personality', 'profile', 'image'],
    };

    const order = priorityOrder[phase.phase] || priorityOrder.cold;

    return guidanceList.sort((a, b) => {
      if (a.priority !== b.priority) {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      }
      return order.indexOf(a.category) - order.indexOf(b.category);
    });
  }

  async getNextGuidance(userId: number): Promise<Guidance | null> {
    const guidanceList = await this.generateGuidance(userId);
    const lastShown = await this.getLastShownGuidance(userId);

    const newGuidance = guidanceList.filter(
      (g) => !lastShown.includes(g.category) || g.priority === 'high',
    );

    if (newGuidance.length === 0) return null;

    await this.userEventService.log({
      userId,
      type: EventType.GUIDANCE_SHOWN,
      metadata: {
        category: newGuidance[0].category,
        priority: newGuidance[0].priority,
      },
    });

    return newGuidance[0];
  }

  private async getLastShownGuidance(userId: number): Promise<string[]> {
    // TODO: از Redis بگیر
    return [];
  }

  async getCompletionRate(userId: number): Promise<number> {
    return 0.7; // TODO: implement real logic
  }
}
