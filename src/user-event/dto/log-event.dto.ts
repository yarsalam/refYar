import { EventType } from '../entities/user-event.entity';

export class LogEventDto {
  userId: number;
  targetUserId?: number | null;
  type: EventType;
  sessionId?: string;
  metadata?: any;
  value?: number;
  currency?: string;
  duration?: number;
  platform?: string;
  country?: string;
}
