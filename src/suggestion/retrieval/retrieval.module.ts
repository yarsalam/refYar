import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VectorSearchService } from './vector-search.service';
import { UserFeatureSnapshot } from '../../feature-store/entities/user-feature.entity';
import { User } from '../../users/entities/user.entity';
import { RedisModule } from '../../redis/redis.module';
import { FeatureStoreService } from 'src/feature-store/feature-store.service';
import { PersonalityModule } from 'src/personality/personality.module';
import { UserEventModule } from 'src/user-event/user-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserFeatureSnapshot, User]),
    RedisModule,
    PersonalityModule,
    UserEventModule,
  ],
  providers: [VectorSearchService, FeatureStoreService],

  exports: [VectorSearchService],
})
export class RetrievalModule {}
