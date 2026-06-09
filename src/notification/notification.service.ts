import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AppNotification,
  NotificationType,
} from './entities/notification.entity';
import { NotificationOrchestrator } from './orchestrator.notification';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(AppNotification)
    private readonly notifRepo: Repository<AppNotification>,
    private readonly orchestrator: NotificationOrchestrator,
  ) {}

  async createNotification(data: {
    user_id: number;
    type: 'message' | 'visitor';
    message: string;
    related_id?: number;
  }) {
    const notif = this.notifRepo.create({
      ...data,
      type: data.type as NotificationType,
    });
    await this.notifRepo.save(notif);
    // dispatch به صورت fire-and-forget — ساخت notif را کند نمی‌کند
    this.orchestrator.dispatch(notif).catch(() => {});
    return notif;
  }

  async getUserNotifications(userId: number) {
    return this.notifRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async markAsRead(notificationId: number) {
    return this.notifRepo.update(notificationId, { is_read: true });
  }

  async countUnread(userId: number) {
    return this.notifRepo.count({
      where: { user_id: userId, is_read: false },
    });
  }
}
