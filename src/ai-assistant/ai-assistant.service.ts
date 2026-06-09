import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssistantConversation } from './entities/assistant-conversation.entity';
import { AssistantMessage } from './entities/assistant-message.entity';
import { ProblemDetectorService } from './analyzers/problem-detector.service';
import { GuidanceGeneratorService } from './guidance/guidance-generator.service';
import { PhaseOptimizerService } from './optimizers/phase-optimizer.service';
import { UserEventService } from '../user-event/user-event.service';
import { EventType } from '../user-event/entities/user-event.entity';
import { User } from 'src/users/entities/user.entity';
import { PaymentsService } from 'src/payments/payments.service';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    @InjectRepository(AssistantConversation)
    private convRepo: Repository<AssistantConversation>,

    @InjectRepository(AssistantMessage)
    private msgRepo: Repository<AssistantMessage>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,

    private readonly problemDetector: ProblemDetectorService,
    private readonly guidanceGenerator: GuidanceGeneratorService,
    private readonly phaseOptimizer: PhaseOptimizerService,
    private readonly userEventService: UserEventService,
  ) {}

  async getNextGuidance(userId: number) {
    const guidance = await this.guidanceGenerator.getNextGuidance(userId);
    if (!guidance) {
      return {
        hasGuidance: false,
        message: 'همه چی عالیه! به همین خوبی ادامه بده 🎉',
      };
    }
    return { hasGuidance: true, guidance };
  }

  async getOptimizationPlan(userId: number) {
    return this.phaseOptimizer.createOptimizationPlan(userId);
  }

  async getUserProblems(userId: number) {
    return this.problemDetector.detectProblems(userId);
  }

  async getAdvice(userId: number) {
    // یک بار detectProblems صدا زده می‌شود و نتیجه به هر سه استفاده می‌رسد
    const problems = await this.problemDetector.detectProblems(userId);
    const [guidance, plan] = await Promise.all([
      this.guidanceGenerator.getNextGuidance(userId),
      this.phaseOptimizer.createOptimizationPlan(userId),
    ]);

    return {
      userId,
      timestamp: new Date().toISOString(),
      summary: {
        problemsCount: problems.length,
        hasCriticalProblem: problems.some((p) => p.severity === 'critical'),
        currentPhase: plan.currentPhase,
        nextPhase: plan.targetPhase,
      },
      topProblems: problems.slice(0, 3),
      nextGuidance: guidance,
      optimizationPlan: plan,
    };
  }

  async startConversation(userId: number, initialMessage?: string) {
    const conv = this.convRepo.create({
      user: { id: userId } as any,
      status: 'open',
    });
    await this.convRepo.save(conv);
    if (initialMessage) {
      await this.userSendsMessage(conv.id, initialMessage);
    }
    return conv;
  }

  async getIcebreakers(
    userId: number,
    targetUserId: number,
  ): Promise<string[]> {
    const hasPremium = await this.paymentsService.hasActiveSubscription(
      userId,
      'assistant',
    );
    if (!hasPremium) {
      return [];
    }

    const targetUser = await this.userRepo.findOne({
      where: { id: targetUserId },
      select: ['aboutme', 'hobbies_self', 'values_self', 'city'],
    });

    const icebreakers: string[] = [];

    if (targetUser?.hobbies_self?.length) {
      icebreakers.push(
        `سلام! منم ${targetUser.hobbies_self[0]} رو خیلی دوست دارم. تو کجا این کارو میکنی؟`,
      );
    }
    if (targetUser?.city) {
      icebreakers.push(
        `سلام! ${targetUser.city} رو دوست داری؟ من چندبار اونجا بودم.`,
      );
    }
    if (targetUser?.aboutme) {
      icebreakers.push(
        `درباره خودت نوشتی "${targetUser.aboutme.slice(0, 30)}..." جالبه!`,
      );
    }
    return icebreakers;
  }

  async suggestReply(userId: number, message: string): Promise<string | null> {
    const hasPremium = await this.paymentsService.hasActiveSubscription(
      userId,
      'assistant',
    );
    if (!hasPremium) return null;

    const suggestions = [
      'چه جالب! بیشتر برام بگو.',
      'منم همینطور! تو چطور?',
      'خیلی خوبه! بعدش چیکار میکنی?',
    ];
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }

  async userSendsMessage(convId: number, message: string) {
    const conv = await this.convRepo.findOne({
      where: { id: convId },
      relations: ['user'],
    });
    if (!conv) throw new Error('Conversation not found');

    const userMsg = this.msgRepo.create({
      conversation: conv,
      sender: 'user',
      content: message,
    });
    await this.msgRepo.save(userMsg);

    const [hasPremium] = await Promise.all([
      this.paymentsService.hasActiveSubscription(conv.user.id, 'assistant'),
      this.userEventService.log({
        userId: conv.user.id,
        type: EventType.MESSAGE_SENT,
        metadata: { textLength: message.length, context: 'assistant' },
      }),
    ]);

    let response = '';
    let hasGuidance = false;

    if (
      message.includes('راهنما') ||
      message.includes('چیکار کنم') ||
      message.includes('help')
    ) {
      const guidance = await this.guidanceGenerator.getNextGuidance(
        conv.user.id,
      );
      if (guidance) {
        response = `✅ ${guidance.message}`;
        hasGuidance = true;
      } else {
        response = 'همه چی عالیه! به همین خوبی ادامه بده 🎉';
      }
    } else if (hasPremium) {
      const suggested = await this.suggestReply(conv.user.id, message);
      response = suggested || 'در خدمت شما هستم. چطور می‌تونم کمکت کنم؟';
    } else {
      response =
        'ممنون از پیامت. برای دریافت راهنمایی، می‌تونی از بخش "راهنمایی من" استفاده کنی.';
    }

    const assistantMsg = this.msgRepo.create({
      conversation: conv,
      sender: 'assistant',
      content: response,
    });
    await this.msgRepo.save(assistantMsg);

    return {
      message: response,
      hasGuidance: hasGuidance || response.includes('✅'),
    };
  }

  async listConversationsForUser(userId: number) {
    return this.convRepo.find({
      where: { user: { id: userId } },
      order: { updatedAt: 'DESC' },
      take: 20, // pagination: فقط ۲۰ آخرین مکالمه
    });
  }

  async getConversation(convId: number) {
    return this.convRepo.findOne({
      where: { id: convId },
      relations: ['messages'],
    });
  }
}
