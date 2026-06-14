import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UserEventModule } from '../user-event/user-event.module';
import { RelationStatusModule } from '../relation-status/relation-status.module';
import { FeatureStoreModule } from '../feature-store/feature-store.module';

// سرویس‌های جدید
import { UsersService } from './users.service';
import { UserCrudService } from './crud/user-crud.service';
import { UserFilterService } from './filter/user-filter.service';
import { UserAccountService } from './account/user-account.service';
import { UserDiscoveryService } from './discovery/user-discovery.service';
import { UserSimilarityService } from './similarity/user-similarity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => RelationStatusModule),
    UserEventModule,
    FeatureStoreModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserCrudService,
    UserFilterService,
    UserAccountService,
    UserDiscoveryService,
    UserSimilarityService,
  ],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
