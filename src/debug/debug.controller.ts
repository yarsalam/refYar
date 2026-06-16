import { Controller, Get, Param } from '@nestjs/common';
import { VectorSearchService } from '../suggestion/retrieval/vector-search.service';
import { SuggestionService } from '../suggestion/suggestion.service';
import { RelationStatusService } from '../relation-status/relation-status.service';
import { FeedAssemblerService } from 'src/feed/services/feed-assembler.service';

@Controller('debug')
export class DebugController {
  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly suggestionService: SuggestionService,
    private readonly feedAssembler: FeedAssemblerService,
    private readonly relationStatus: RelationStatusService,
  ) {}

  @Get('suggestions/:userId')
  async testSuggestions(@Param('userId') userId: number) {
    try {
      const candidates = await this.vectorSearch.findCandidates(userId, 200);
      const suggestions =
        await this.suggestionService.getSuggestionsForUser(userId);
      return {
        candidatesCount: candidates.length,
        suggestionsCount: suggestions.length,
        candidates,
        suggestions,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      return { error: message, stack };
    }
  }

  @Get('feed/:userId')
  async testFeed(@Param('userId') userId: number) {
    try {
      const feed = await this.feedAssembler.buildFeed(userId, { limit: 5 });
      return { feedLength: feed.length, feed };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      return { error: message, stack };
    }
  }

  @Get('relation/:userId/:targetId')
  async testRelation(
    @Param('userId') userId: number,
    @Param('targetId') targetId: number,
  ) {
    try {
      const rel = await this.relationStatus.getEffectiveRelation(
        userId,
        targetId,
      );
      return rel;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      return { error: message, stack };
    }
  }
}
