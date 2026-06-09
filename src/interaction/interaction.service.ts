import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interaction, InteractionType } from './entities/interaction.entity';
import { User } from 'src/users/entities/user.entity';
import { ReportBlockService } from 'src/report-block/report-block.service';
import { Message } from 'src/message/entities/message.entity';
import { EventType } from 'src/user-event/entities/user-event.entity';
import { UserEventService } from 'src/user-event/user-event.service';
import { PhaseService } from 'src/phase/phase.service';
import { RevenueScorerService } from 'src/suggestion/scoring/revenue-scorer.service';
import { FeatureStoreService } from 'src/feature-store/feature-store.service';
import { PersonalityService } from 'src/personality/personality.service';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(
    @InjectRepository(Interaction)
    private readonly interactionRepo: Repository<Interaction>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @Inject(forwardRef(() => PhaseService))
    private readonly phaseService: PhaseService,

    private readonly reportBlockService: ReportBlockService,
    private readonly userEventService: UserEventService,
    private readonly revenueScorer: RevenueScorerService,
    private readonly featureStore: FeatureStoreService,
    private readonly personalityService: PersonalityService,
    private readonly redis: RedisService,
  ) {}

  private mapInteractionToEvent(type: InteractionType): EventType {
    switch (type) {
      case 'view':
        return EventType.PROFILE_VIEW;
      case 'like':
        return EventType.LIKE;
      case 'superlike':
        return EventType.SUPERLIKE;
      case 'skip':
        return EventType.SKIP;
      case 'message':
        return EventType.MESSAGE_SENT;
      default:
        return EventType.PROFILE_VIEW;
    }
  }

  async record(
    fromId: number,
    toId: number,
    type: InteractionType,
    metadata: Record<string, any> = {},
  ): Promise<Interaction | null> {
    const can = await this.canInteract(fromId, toId);
    if (!can) return null;

    const interaction = this.interactionRepo.create({
      sender: { id: fromId },
      receiver: { id: toId },
      type,
      metadata,
    });

    const saved = await this.interactionRepo.save(interaction);

    await Promise.all([
      this.redis.del(`relation:${fromId}:${toId}`),
      this.redis.del(`relation:${toId}:${fromId}`),
    ]);

    this.doPostInteractionTasks(fromId, toId, type).catch((err) =>
      this.logger.error(`Post-interaction tasks failed: ${err.message}`),
    );

    return saved;
  }

  private async doPostInteractionTasks(
    fromId: number,
    toId: number,
    type: InteractionType,
  ): Promise<void> {
    const eventType = this.mapInteractionToEvent(type);
    try {
      await this.userEventService.log({
        userId: fromId,
        type: eventType,
        metadata: { source: 'interaction', interactionType: type },
      });
    } catch (e) {
      this.logger.warn(`UserEvent failed: ${e.message}`);
    }

    if (type === 'like' || type === 'superlike') {
      const targetFeatures = await this.featureStore.getUserFeatures(toId);
      if (targetFeatures?.profileVector) {
        await this.featureStore.updatePreferenceVector(
          fromId,
          targetFeatures.profileVector,
          type === 'superlike' ? 2.0 : 1.0,
        );
      }

      const isMutual = await this.isMutualLike(fromId, toId);
      if (isMutual) {
        try {
          await Promise.all([
            this.phaseService.learnFromFeedback(fromId, 'match'),
            this.phaseService.learnFromFeedback(toId, 'match'),
            this.personalityService.learnFromMatch(fromId, toId),
          ]);

          const [userPhase, candidatePhase] = await Promise.all([
            this.phaseService.get(fromId),
            this.phaseService.get(toId),
          ]);

          if (userPhase && candidatePhase) {
            await Promise.all([
              this.revenueScorer.adjustPhaseMultiplier(
                userPhase.phase,
                candidatePhase.phase,
                1.0,
              ),
              this.revenueScorer.adjustPhaseMultiplier(
                candidatePhase.phase,
                userPhase.phase,
                1.0,
              ),
            ]);
          }

          await Promise.all([
            this.featureStore.learnFeatureWeights(fromId, 'match'),
            this.featureStore.learnFeatureWeights(toId, 'match'),
          ]);
        } catch (e) {
          this.logger.error(`Match learning failed: ${e.message}`);
        }
      }
    }
  }

  private async isMutualLike(
    userId1: number,
    userId2: number,
  ): Promise<boolean> {
    // استفاده از exist به جای findOne برای بهینگی
    return this.interactionRepo.exist({
      where: [
        { sender: { id: userId2 }, receiver: { id: userId1 }, type: 'like' },
        {
          sender: { id: userId2 },
          receiver: { id: userId1 },
          type: 'superlike',
        },
      ],
    });
  }

  async getUserInteractions(userId: number) {
    return this.interactionRepo.find({
      where: { sender: { id: userId } },
      relations: ['receiver'],
      order: { createdAt: 'DESC' },
    });
  }

  async getReceivedInteractions(userId: number) {
    return this.interactionRepo.find({
      where: { receiver: { id: userId } },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
    });
  }

  async getInteractionsBetweenUsers(userId: number, targetUserId: number) {
    return this.interactionRepo.find({
      where: [
        { sender: { id: userId }, receiver: { id: targetUserId } },
        { sender: { id: targetUserId }, receiver: { id: userId } },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async canInteract(userId: number, targetUserId: number): Promise<boolean> {
    const [blockedIds, reverseBlocked] = await Promise.all([
      this.reportBlockService.getBlockedUserIds(userId),
      this.reportBlockService.getBlockedUserIds(targetUserId),
    ]);
    if (blockedIds.includes(targetUserId)) return false;
    if (reverseBlocked.includes(userId)) return false;
    return true;
  }

  async getUserMessages(userId: number): Promise<string[]> {
    const messages = await this.messageRepo.find({
      where: { from_id: userId },
    });
    return messages.map((m) => m.content);
  }
}
