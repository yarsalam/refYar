import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BoostQueueService } from '../../redis/boost-queue.service';
import { SuggestionService } from '../../suggestion/suggestion.service';

@Injectable()
export class FeedCandidateService {
  private readonly logger = new Logger(FeedCandidateService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly boostQueueService: BoostQueueService,
    private readonly suggestionService: SuggestionService,
  ) {}

  private randomSample<T>(arr: T[], count: number): T[] {
    if (arr.length <= count) return arr;
    return [...arr].sort(() => 0.5 - Math.random()).slice(0, count);
  }

  async getBoostedCandidates(limit: number): Promise<number[]> {
    const boosted = await this.boostQueueService.getBoostedUsers(10);
    return this.randomSample(boosted, limit);
  }

  async getVipCandidates(limit: number): Promise<number[]> {
    const vip = await this.boostQueueService.getActiveVipUsers(8);
    return this.randomSample(vip, limit);
  }

  async getHighCreditCandidates(limit: number): Promise<number[]> {
    const credit = await this.boostQueueService.getHighCreditUsers(8);
    return this.randomSample(credit, limit);
  }

  async getSuggestionCandidates(userId: number, limit: number): Promise<any[]> {
    return this.suggestionService.getSuggestionsForUser(userId, {
      limit: limit * 2,
    });
  }

  async getUsersByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.userRepo.find({
      where: { id: In(ids) },
      relations: ['userImages', 'boost'],
    });
  }
}
