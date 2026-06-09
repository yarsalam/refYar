import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VectorSearchService } from './vector-search.service';
import { UserFeatureSnapshot } from '../../feature-store/entities/user-feature.entity';
import { User } from '../../users/entities/user.entity';
import { RedisModule } from '../../redis/redis.module'; // اگر BoostQueueService و REDIS_CLIENT از این ماژول هستند

@Module({
  imports: [
    TypeOrmModule.forFeature([UserFeatureSnapshot, User]),
    RedisModule, // تأمین REDIS_CLIENT و BoostQueueService
  ],
  providers: [VectorSearchService],
  exports: [VectorSearchService],
})
export class RetrievalModule {}
