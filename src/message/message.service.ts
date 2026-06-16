import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { NotificationService } from 'src/notification/notification.service';
import { AppNotification } from 'src/notification/entities/notification.entity';
import { GroupedMessageDto } from './dto/grouped-message.dto';
import { User } from 'src/users/entities/user.entity';
import { getUserAvatar } from 'src/helpers/user-query.helper';
import { formatToJalali } from 'src/helpers/date.utils';
import { EventType } from 'src/user-event/entities/user-event.entity';
import { UserEventService } from 'src/user-event/user-event.service';
import { ModerationService } from 'src/moderation/moderation.service';
import { CreditsService } from 'src/payments/credits/credits.service';
import { PaywallException } from 'src/payments/paywall/paywall.exception';

import { RevenueScorerService } from 'src/suggestion/scoring/revenue-scorer.service';
import { FeatureStoreService } from 'src/feature-store/feature-store.service';
import { RelationStatusService } from 'src/relation-status/relation-status.service';
import { ChatGateway } from './chat.gateway';
import { Repository, IsNull, In } from 'typeorm';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(AppNotification)
    private readonly notifRepo: Repository<AppNotification>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly chatGateway: ChatGateway,

    private readonly notificationService: NotificationService,
    private readonly userEventService: UserEventService,
    private readonly moderationService: ModerationService,
    private readonly creditsService: CreditsService,
    private readonly revenueScorer: RevenueScorerService,
    private readonly featureStore: FeatureStoreService,
    private readonly relationStatus: RelationStatusService,
  ) {}

  async sendMessage(dto: CreateMessageDto) {
    const relation = await this.relationStatus.getEffectiveRelation(
      dto.from_id,
      dto.to_id,
    );
    if (relation.isBlocked) {
      throw new Error('امکان ارسال پیام به کاربر بلاک‌شده وجود ندارد');
    }

    const moderationResult = await this.moderationService.moderateMessage(
      dto.content,
      dto.from_id,
      dto.to_id,
    );

    if (moderationResult.action === 'block') {
      this.logger.warn(
        `Message blocked by moderation: user ${dto.from_id} -> ${dto.to_id}, severity: ${moderationResult.severity}`,
      );
      throw new Error('پیام شما به دلیل محتوای نامناسب ارسال نشد.');
    }

    if (!dto.is_free) {
      try {
        await this.creditsService.consume(dto.from_id, 1, 'send_message');
      } catch (error) {
        if (error instanceof PaywallException) throw error;
        throw new Error('خطا در بررسی اعتبار');
      }
    }

    const message = this.messageRepo.create({
      ...dto,
      is_free: dto.is_free ?? true,
    });

    const saved = await this.messageRepo.save(message);

    // Room name normalized
    const room = ChatGateway.getRoomName(saved.from_id, saved.to_id);
    this.chatGateway.emitNewMessage(room, saved);

    await Promise.all([
      this.userEventService.log({
        userId: dto.from_id,
        type: EventType.MESSAGE_SENT,
        targetUserId: dto.to_id,
        metadata: {
          length: dto.content.length,
          isFree: saved.is_free,
          moderated: true,
          moderationSeverity: moderationResult.severity,
        },
      }),
      this.notificationService.createNotification({
        user_id: dto.to_id,
        type: 'message',
        message: 'شما یک پیام جدید دارید.',
        related_id: saved.id,
      }),
      // ✅ phaseService.learnFromFeedback حذف شد — Phase مستقل است
      this.featureStore.learnFeatureWeights(dto.from_id, 'message'),
    ]);

    // ✅ phaseService.learnFromFeedback حذف شد — Phase اکنون مستقل است.
    // phase multiplier بعداً با event-driven approach آپدیت می‌شود.

    return saved;
  }

  async getInbox(userId: number, isFree?: boolean) {
    const query = this.messageRepo
      .createQueryBuilder('message')
      .where('message.to_id = :userId', { userId })
      .andWhere('message.deleted_to = false');

    if (isFree !== undefined) {
      query.andWhere('message.is_free = :isFree', { isFree });
    }

    return query.orderBy('message.created_at', 'DESC').getMany();
  }

  async getSent(userId: number, isFree?: boolean) {
    const query = this.messageRepo
      .createQueryBuilder('message')
      .where('message.from_id = :userId', { userId })
      .andWhere('message.deleted_from = false');

    if (isFree !== undefined) {
      query.andWhere('message.is_free = :isFree', { isFree });
    }

    return query.orderBy('message.created_at', 'DESC').getMany();
  }

  async markAsRead(messageId: number) {
    return this.messageRepo.update(messageId, { read_at: new Date() });
  }

  async deleteFromInbox(messageId: number, userId: number) {
    const message = await this.messageRepo.findOneBy({
      id: messageId,
      to_id: userId,
    });
    if (!message) throw new NotFoundException();
    message.deleted_to = true;
    return this.messageRepo.save(message);
  }

  async deleteFromSent(messageId: number, userId: number) {
    const message = await this.messageRepo.findOneBy({
      id: messageId,
      from_id: userId,
    });
    if (!message) throw new NotFoundException();
    message.deleted_from = true;
    return this.messageRepo.save(message);
  }

  async getSentGroupedByUser(userId: number): Promise<GroupedMessageDto[]> {
    const messages = await this.messageRepo.find({
      where: { from_id: userId, deleted_from: false },
      order: { created_at: 'DESC' },
      relations: ['to', 'to.userImages'],
    });

    if (!messages.length) return [];

    // رفع N+1: جمع‌آوری یکجا و Map کردن
    const userIds = [...new Set(messages.map((msg) => msg.to_id))];
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
      select: ['id', 'status'],
    });
    const userStatusMap = new Map(users.map((u) => [u.id, u.status]));

    const result: GroupedMessageDto[] = [];

    for (const toId of userIds) {
      const userMessages = messages.filter((msg) => msg.to_id === toId);
      const freeMessages = userMessages.filter((msg) => msg.is_free);
      const paidMessages = userMessages.filter((msg) => !msg.is_free);
      const lastFreeMessage = freeMessages[0];
      const lastPaidMessage = paidMessages[0];
      const targetStatus = userStatusMap.get(toId);

      const flags = this.getUserFlagsSync(targetStatus);
      const avatar = getUserAvatar(userMessages[0].to);

      if (freeMessages.length > 0 && lastFreeMessage) {
        const { date, time } = formatToJalali(lastFreeMessage.created_at);
        result.push({
          userId: toId,
          name: userMessages[0].to.nickname,
          avatar,
          lastMessageSnippet:
            lastFreeMessage.content.slice(0, 20) +
            (lastFreeMessage.content.length > 20 ? '...' : ''),
          isFree: true,
          unread: false,
          lastFreeMessageDate: date,
          lastFreeMessageTime: time,
          unreadFreeMessagesCount: 0,
          ...flags,
        });
      }

      if (paidMessages.length > 0 && lastPaidMessage) {
        const { date, time } = formatToJalali(lastPaidMessage.created_at);
        result.push({
          userId: toId,
          name: userMessages[0].to.nickname,
          avatar,
          lastMessageSnippet:
            lastPaidMessage.content.slice(0, 20) +
            (lastPaidMessage.content.length > 20 ? '...' : ''),
          isFree: false,
          unread: false,
          lastPaidMessageDate: date,
          lastPaidMessageTime: time,
          unreadPaidMessagesCount: 0,
          ...flags,
        });
      }
    }

    return result;
  }

  async getInboxGroupedByUser(userId: number): Promise<GroupedMessageDto[]> {
    const messages = await this.messageRepo.find({
      where: { to_id: userId, deleted_to: false },
      order: { created_at: 'DESC' },
      relations: ['from', 'from.userImages'],
    });

    if (!messages.length) return [];

    // رفع N+1
    const userIds = [...new Set(messages.map((msg) => msg.from_id))];
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
      select: ['id', 'status'],
    });
    const userStatusMap = new Map(users.map((u) => [u.id, u.status]));

    const result: GroupedMessageDto[] = [];

    for (const fromId of userIds) {
      const userMessages = messages.filter((msg) => msg.from_id === fromId);
      const freeMessages = userMessages.filter((msg) => msg.is_free);
      const paidMessages = userMessages.filter((msg) => !msg.is_free);
      const lastFreeMessage = freeMessages[0];
      const lastPaidMessage = paidMessages[0];
      const targetStatus = userStatusMap.get(fromId);

      const flags = this.getUserFlagsSync(targetStatus);
      const avatar = getUserAvatar(userMessages[0].from);

      if (freeMessages.length > 0 && lastFreeMessage) {
        const { date, time } = formatToJalali(lastFreeMessage.created_at);
        result.push({
          userId: fromId,
          name: userMessages[0].from.nickname,
          avatar,
          lastMessageSnippet:
            lastFreeMessage.content.slice(0, 20) +
            (lastFreeMessage.content.length > 20 ? '...' : ''),
          isFree: true,
          unread: freeMessages.some((m) => !m.read_at),
          lastFreeMessageDate: date,
          lastFreeMessageTime: time,
          unreadFreeMessagesCount: freeMessages.filter((m) => !m.read_at)
            .length,
          ...flags,
        });
      }

      if (paidMessages.length > 0 && lastPaidMessage) {
        const { date, time } = formatToJalali(lastPaidMessage.created_at);
        result.push({
          userId: fromId,
          name: userMessages[0].from.nickname,
          avatar,
          lastMessageSnippet:
            lastPaidMessage.content.slice(0, 20) +
            (lastPaidMessage.content.length > 20 ? '...' : ''),
          isFree: false,
          unread: paidMessages.some((m) => !m.read_at),
          lastPaidMessageDate: date,
          lastPaidMessageTime: time,
          unreadPaidMessagesCount: paidMessages.filter((m) => !m.read_at)
            .length,
          ...flags,
        });
      }
    }

    return result;
  }

  // sync version برای رفع N+1 در grouped queries
  private getUserFlagsSync(status?: string) {
    return {
      isSuspended: status === 'suspended',
      isResigned: status === 'resigned',
      isAdminBlocked: status === 'admin_blocked',
    };
  }

  private async getUserFlags(
    currentUserId: number,
    targetUserId: number,
    targetUserStatus?: string,
  ) {
    return this.getUserFlagsSync(targetUserStatus);
  }

  async getUserMessages(userId: number) {
    const messages = await this.messageRepo.find({
      where: { from_id: userId },
      order: { created_at: 'DESC' },
      take: 200,
    });
    return messages.map((m) => m.content);
  }

  async getConversation(
    userId: number,
    targetId: number,
    page: number = 0,
    limit: number = 20,
  ): Promise<Message[]> {
    return this.messageRepo.find({
      where: [
        { from_id: userId, to_id: targetId },
        { from_id: targetId, to_id: userId },
      ],
      order: { created_at: 'DESC' },
      skip: page * limit,
      take: limit,
      relations: ['from', 'to'],
    });
  }

  async editMessage(messageId: number, userId: number, content: string) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId, from_id: userId, read_at: IsNull() },
    });
    if (!message) {
      throw new NotFoundException('پیام یافت نشد یا امکان ویرایش وجود ندارد');
    }
    message.content = content;
    return this.messageRepo.save(message);
  }

  async reportMessage(messageId: number, userId: number) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('پیام یافت نشد');
    await this.userEventService.log({
      userId,
      type: EventType.MESSAGE_REPORTED,
      targetUserId: message.from_id,
      metadata: { messageId },
    });
    return { success: true };
  }

  async getTotalUnreadCount(userId: number): Promise<number> {
    return this.messageRepo.count({
      where: { to_id: userId, read_at: IsNull(), deleted_to: false },
    });
  }

  async deleteAllMessages(userId: number) {
    await Promise.all([
      this.messageRepo.update(
        { to_id: userId, deleted_to: false },
        { deleted_to: true },
      ),
      this.messageRepo.update(
        { from_id: userId, deleted_from: false },
        { deleted_from: true },
      ),
    ]);
    return { success: true };
  }

  async deleteConversation(userId: number, targetUserId: number) {
    await Promise.all([
      this.messageRepo.update(
        { to_id: userId, from_id: targetUserId, deleted_to: false },
        { deleted_to: true },
      ),
      this.messageRepo.update(
        { from_id: userId, to_id: targetUserId, deleted_from: false },
        { deleted_from: true },
      ),
    ]);
    return { success: true };
  }

  async markAllAsRead(userId: number, targetUserId: number) {
    await this.messageRepo.update(
      { from_id: targetUserId, to_id: userId, read_at: IsNull() },
      { read_at: new Date() },
    );
    return { success: true };
  }
}
