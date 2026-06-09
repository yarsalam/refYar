import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedBuilderService } from './feed.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorator/get-user/get-user.decorator';

@ApiTags('feed')
@Controller('feed')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedBuilderService) {}

  @Get()
  @ApiOperation({ summary: 'دریافت فید شخصی‌سازی شده' })
  async getFeed(
    @GetUser('id') userId: number,
    @Query('limit') limit?: number,
    @Query('city') city?: string,
  ) {
    const feed = await this.feedService.buildFeed(userId, {
      limit: limit ? parseInt(limit.toString()) : 20,
      city,
    });
    return { success: true, data: feed, timestamp: new Date().toISOString() };
  }

  @Post('dismiss/:promotionId')
  @ApiOperation({ summary: 'ثبت بستن تبلیغ' })
  async dismissPromotion(
    @GetUser('id') userId: number,
    @Param('promotionId') promotionId: string,
  ) {
    return { success: true, message: 'تبلیغ با موفقیت بسته شد' };
  }
}
