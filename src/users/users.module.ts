import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserEventModule } from 'src/user-event/user-event.module';
import { FeatureStoreModule } from 'src/feature-store/feature-store.module';
import { RelationStatusModule } from 'src/relation-status/relation-status.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => FeatureStoreModule),
    forwardRef(() => RelationStatusModule),
    UserEventModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
