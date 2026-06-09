import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Block } from './entities/block.entity';
import { Report } from './entities/report.entity';
import { ReportBlockService } from './report-block.service';
import { ReportBlockController } from './report-block.controller';
import { UserEventModule } from 'src/user-event/user-event.module';
import { TrustScoreService } from 'src/trust/trust-score.service';
import { User } from 'src/users/entities/user.entity';
import { FeatureStoreModule } from 'src/feature-store/feature-store.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Block, Report, User]),
    forwardRef(() => UserEventModule),
    FeatureStoreModule,
  ],
  controllers: [ReportBlockController],
  providers: [ReportBlockService, TrustScoreService],
  exports: [ReportBlockService], // برای استفاده در SuggestionService
})
export class ReportBlockModule {}
