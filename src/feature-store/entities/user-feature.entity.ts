import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_feature_snapshots')
export class UserFeatureSnapshot {
  @PrimaryColumn()
  userId: number;

  @Column({ type: 'json', nullable: true })
  profileVector?: number[];

  @Column({ type: 'json', nullable: true })
  behaviorVector?: number[];

  @Column({ type: 'json', nullable: true })
  preferenceVector?: number[];

  @Column({ type: 'json', nullable: true })
  personalityVector?: number[];

  @Column({ type: 'json', nullable: true })
  geoVector?: number[];

  @Column({ type: 'float', default: 0 })
  avgLTV: number;

  @Column({ type: 'float', default: 0 })
  purchaseProbability: number;

  @Column({ type: 'float', default: 0 })
  responseProbability: number;

  @Column({ type: 'float', default: 0 })
  matchProbability: number;

  @Column({ length: 20 })
  phase: string;

  @Column({ type: 'int', default: 0 })
  boostStrength: number;

  @Column({ type: 'timestamp', nullable: true })
  boostExpiresAt?: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
