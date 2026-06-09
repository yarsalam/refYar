import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('profile_visitors')
@Index(['profileId', 'visitedAt'])
@Index(['visitorId', 'profileId', 'visitedAt'])
@Index(['profileId', 'isMutual'])
export class ProfileVisitor {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'visitor_id' })
  visitor: User;

  @Column()
  visitorId: number;

  @Column()
  profileId: number;

  @Column({ type: 'timestamp' })
  visitedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  @Column({ type: 'int', default: 0 })
  viewDuration: number;

  @Column({ type: 'boolean', default: false })
  isMutual: boolean;

  @Column({ type: 'json', nullable: true })
  metadata?: {
    source: string;
    deviceType: string;
    previousAction?: string;
    visitorTrustScore?: number;
  };

  @ManyToOne(() => User, (user) => user.visitedProfiles)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => User, (user) => user.profileVisitors)
  @JoinColumn({ name: 'profileId' })
  profile: User;

  @CreateDateColumn()
  createdAt: Date;
}
