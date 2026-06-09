import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('payments')
@Index(['userId', 'status'])
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  productCode: string;

  @Column()
  amount: number;

  @Column()
  currency: 'IRT' | 'USDT' | 'BTC';

  @Column()
  method: 'card_to_card' | 'crypto' | 'manual';

  @Column({ default: 'pending' })
  status: 'pending' | 'paid' | 'failed';

  @Column({ nullable: true })
  productId?: string;

  @Column({ nullable: true })
  productType?: string;

  @ManyToOne(() => User, (user) => user.payments)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
