import { Injectable } from '@nestjs/common';

export type CandidateSource = 'boost' | 'vip' | 'credit' | 'suggestion';

@Injectable()
export class FeedScoringService {
  assignPriorityBySource(
    source: CandidateSource,
    suggestionScore?: number,
  ): number {
    switch (source) {
      case 'boost':
        return 100;
      case 'vip':
        return 80;
      case 'credit':
        return 60;
      case 'suggestion':
        return suggestionScore ?? 50;
      default:
        return 50;
    }
  }

  sortByPriority<T extends { priority?: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }
}
