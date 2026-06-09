import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class CreateNotificationDto {
  @IsInt()
  user_id: number;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  message: string;

  @IsOptional()
  @IsInt()
  related_id?: number;

  @IsOptional()
  @IsEnum(['ai', 'system', 'user'])
  source?: 'ai' | 'system' | 'user';
}
