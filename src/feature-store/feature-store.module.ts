import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserFeatureSnapshot } from './entities/user-feature.entity';
import { FeatureStoreService } from './feature-store.service';
import { UsersModule } from '../users/users.module';
import { PersonalityModule } from '../personality/personality.module';
import { UserEventModule } from '../user-event/user-event.module';
import { RedisModule } from '../redis/redis.module';
import { Personality } from 'src/personality/entities/personality.entity';
import { FeatureStoreController } from './feature-store.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserFeatureSnapshot, Personality]),
    forwardRef(() => UsersModule),
    PersonalityModule,
    UserEventModule,
    RedisModule,
  ],
  providers: [FeatureStoreService],
  exports: [FeatureStoreService],
  controllers: [FeatureStoreController],
})
export class FeatureStoreModule {}
