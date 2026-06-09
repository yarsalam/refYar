import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationType {
  MESSAGE = 'message',
  VISITOR = 'visitor',
}

@Entity('notifications')
@Index(['user_id', 'is_read'])
export class AppNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  user_id: number;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  message: string;

  @Column({ default: false })
  delivered: boolean;

  @Column({ default: false })
  clicked: boolean;

  @Column({ default: false })
  is_read: boolean;

  @Column({ nullable: true })
  related_id: number;

  @CreateDateColumn()
  created_at: Date;
}
