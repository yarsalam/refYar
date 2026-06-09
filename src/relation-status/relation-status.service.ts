import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Interaction } from 'src/interaction/entities/interaction.entity';
import { RelationStatusDto } from './dto/relation-status.dto';
import { RedisService } from 'src/redis/redis.service';
import { Block } from 'src/report-block/entities/block.entity';
import { Report } from 'src/report-block/entities/report.entity';

@Injectable()
export class RelationStatusService {
  constructor(
    @InjectRepository(Interaction)
    private readonly interactionRepo: Repository<Interaction>,

    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,

    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,

    private readonly redis: RedisService,
  ) {}

  async getEffectiveRelation(
    currentUserId: number,
    targetUserId: number,
  ): Promise<RelationStatusDto> {
    const cacheKey = `relation:${currentUserId}:${targetUserId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dto = new RelationStatusDto();

    // 1. Interactions (بدون JOIN)
    const interactions = await this.interactionRepo
      .createQueryBuilder('i')
      .select(['i.type', 'i.senderId', 'i.receiverId'])
      .where(
        `(i.senderId = :me AND i.receiverId = :target)
         OR (i.senderId = :target AND i.receiverId = :me)`,
        { me: currentUserId, target: targetUserId },
      )
      .getRawMany();

    // 2. Block status (با استفاده از ستون‌های واقعی دیتابیس)
    const blockStatus = await this.blockRepo
      .createQueryBuilder('b')
      .select(['b.userId', 'b.targetUserId'])
      .where(
        `(b.userId = :me AND b.targetUserId = :target)
         OR (b.userId = :target AND b.targetUserId = :me)`,
        { me: currentUserId, target: targetUserId },
      )
      .getRawMany();
    // 3. Report status
    const reportExists = await this.reportRepo
      .createQueryBuilder('r')
      .select('1')
      .where(
        'r.reporterId = :me AND r.reportedUserId = :target AND r.confirmed = true',
        {
          me: currentUserId,
          target: targetUserId,
        },
      )
      .getRawOne();

    // پردازش Block
    for (const b of blockStatus) {
      if (b.userId === currentUserId) dto.blockedByMe = true;
      else dto.blockedMe = true;
    }
    dto.isBlocked = dto.blockedByMe || dto.blockedMe;
    dto.hasReported = !!reportExists;

    // پردازش Interaction
    for (const inter of interactions) {
      const isMe = inter.senderId === currentUserId;
      switch (inter.i_type) {
        case 'like':
          if (isMe) dto.hasLiked = true;
          else dto.likedByThem = true;
          break;
        case 'superlike':
          if (isMe) dto.hasSuperLiked = true;
          else dto.superLikedByThem = true;
          break;
        case 'match':
          dto.isMatch = true;
          break;
        case 'message':
          dto.hasMessaged = true;
          break;
        case 'view':
          if (isMe) dto.hasViewed = true;
          break;
      }
    }

    this.applyEffectiveState(dto);
    await this.redis.set(cacheKey, JSON.stringify(dto), 60);
    return dto;
  }

  async getEffectiveRelationsBatch(
    userId: number,
    targetIds: number[],
  ): Promise<Map<number, RelationStatusDto>> {
    const resultMap = new Map<number, RelationStatusDto>();
    if (!targetIds?.length) return resultMap;
    for (const id of targetIds) resultMap.set(id, new RelationStatusDto());

    // ----- 1. Block status (batch) -----
    const blocksByMe = await this.blockRepo
      .createQueryBuilder('b')
      .select(['b.userId', 'b.targetUserId'])
      .where('b.userId = :me AND b.targetUserId IN (:...targets)', {
        me: userId,
        targets: targetIds,
      })
      .getRawMany();

    const blocksOfMe = await this.blockRepo
      .createQueryBuilder('b')
      .select(['b.userId', 'b.targetUserId'])
      .where('b.targetUserId = :me AND b.userId IN (:...targets)', {
        me: userId,
        targets: targetIds,
      })
      .getRawMany();

    const blockedByMeSet = new Set(blocksByMe.map((b) => b.targetUserId));
    const blockedMeSet = new Set(blocksOfMe.map((b) => b.userId));

    // ----- 2. Report status (batch) -----
    const reports = await this.reportRepo
      .createQueryBuilder('r')
      .select('r.reportedUserId')
      .where(
        'r.reporterId = :me AND r.reportedUserId IN (:...targets) AND r.confirmed = true',
        {
          me: userId,
          targets: targetIds,
        },
      )
      .getRawMany();

    const reportedByMeSet = new Set(reports.map((r) => r.r_reportedUserId));

    // ----- 3. Interactions (batch) -----
    const interactions = await this.interactionRepo
      .createQueryBuilder('i')
      .select(['i.type', 'i.senderId', 'i.receiverId'])
      .where(
        `(i.senderId = :me AND i.receiverId IN (:...targets))
         OR (i.receiverId = :me AND i.senderId IN (:...targets))`,
        { me: userId, targets: targetIds },
      )
      .getRawMany();

    // ----- 4. Fill DTOs -----
    for (const targetId of targetIds) {
      const dto = resultMap.get(targetId)!;
      dto.blockedByMe = blockedByMeSet.has(targetId);
      dto.blockedMe = blockedMeSet.has(targetId);
      dto.isBlocked = dto.blockedByMe || dto.blockedMe;
      dto.hasReported = reportedByMeSet.has(targetId);
    }

    for (const inter of interactions) {
      const targetId =
        inter.i_senderId === userId ? inter.i_receiverId : inter.i_senderId;
      const dto = resultMap.get(targetId);
      if (!dto) continue;
      const isMe = inter.i_senderId === userId;
      switch (inter.i_type) {
        case 'like':
          if (isMe) dto.hasLiked = true;
          else dto.likedByThem = true;
          break;
        case 'superlike':
          if (isMe) dto.hasSuperLiked = true;
          else dto.superLikedByThem = true;
          break;
        case 'match':
          dto.isMatch = true;
          break;
        case 'message':
          dto.hasMessaged = true;
          break;
        case 'view':
          if (isMe) dto.hasViewed = true;
          break;
      }
    }

    for (const [, dto] of resultMap) this.applyEffectiveState(dto);
    return resultMap;
  }

  private applyEffectiveState(dto: RelationStatusDto) {
    if (dto.isBlocked) return (dto.effectiveState = 'blocked');
    if (dto.isMatch) return (dto.effectiveState = 'match');
    if (dto.hasSuperLiked) return (dto.effectiveState = 'superliked');
    if (dto.hasLiked) return (dto.effectiveState = 'liked');
    dto.effectiveState = 'none';
  }
}
