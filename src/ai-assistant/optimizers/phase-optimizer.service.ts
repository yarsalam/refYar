import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PhaseService } from '../../phase/phase.service';
import { ProblemDetectorService } from '../analyzers/problem-detector.service';
import { GuidanceGeneratorService } from '../guidance/guidance-generator.service';
import { UserEventService } from '../../user-event/user-event.service';
import { EventType } from '../../user-event/entities/user-event.entity';

export interface PhaseOptimizationPlan {
  userId: number;
  currentPhase: string;
  targetPhase: string;
  steps: {
    order: number;
    action: string;
    guidanceId: string;
    expectedImpact: string;
  }[];
  estimatedTimeToNextPhase: string;
}

@Injectable()
export class PhaseOptimizerService {
  private readonly logger = new Logger(PhaseOptimizerService.name);

  constructor(
    private readonly phaseService: PhaseService,
    private readonly problemDetector: ProblemDetectorService,
    private readonly guidanceGenerator: GuidanceGeneratorService,
    private readonly userEventService: UserEventService,
    @InjectQueue('phase-check') private readonly phaseCheckQueue: Queue,
  ) {}

  async createOptimizationPlan(userId: number): Promise<PhaseOptimizationPlan> {
    const phase = await this.phaseService.getPhaseMetrics(userId);
    const problems = await this.problemDetector.detectProblems(userId);
    const guidances = await this.guidanceGenerator.generateGuidance(userId);

    let targetPhase = phase.phase;
    if (phase.phase === 'cold') targetPhase = 'warm';
    else if (phase.phase === 'warm') targetPhase = 'hot';
    else targetPhase = 'hot';

    const steps = guidances
      .filter((g) => g.priority === 'high' || g.priority === 'medium')
      .map((g, index) => ({
        order: index + 1,
        action: g.message,
        guidanceId: g.id,
        expectedImpact:
          problems.find((p) => p.category === g.category)?.impact ||
          'بهبود عملکرد',
      }));

    const progress = (phase.score / phase.nextPhaseThreshold) * 100;
    const estimatedTimeToNextPhase = this.estimateTime(phase.phase, progress);

    const plan = {
      userId,
      currentPhase: phase.phase,
      targetPhase,
      steps,
      estimatedTimeToNextPhase,
    };

    await this.userEventService.log({
      userId,
      type: EventType.PHASE_OPTIMIZATION_PLAN,
      metadata: {
        currentPhase: phase.phase,
        targetPhase,
        stepsCount: steps.length,
      },
    });

    return plan;
  }

  private estimateTime(currentPhase: string, progress: number): string {
    if (currentPhase === 'cold') {
      if (progress < 30) return '۵-۷ روز';
      if (progress < 70) return '۳-۵ روز';
      return '۱-۲ روز';
    }

    if (currentPhase === 'warm') {
      if (progress < 30) return '۷-۱۰ روز';
      if (progress < 70) return '۴-۷ روز';
      return '۲-۳ روز';
    }

    return 'شما در بالاترین فاز هستید';
  }

  async trackProgress(userId: number): Promise<void> {
    const oldPhase = await this.phaseService.getPhaseMetrics(userId);

    // به جای setTimeout از BullMQ Delayed Job استفاده می‌کنیم
    await this.phaseCheckQueue.add(
      'check-phase-upgrade',
      { userId, fromPhase: oldPhase.phase },
      { delay: 7 * 24 * 60 * 60 * 1000 }, // 7 روز
    );
  }
}
