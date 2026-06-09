import { Controller, Post, Param, ParseIntPipe } from '@nestjs/common';
import { BoostService } from './boosts.service';

@Controller('boost')
export class BoostController {
  constructor(private readonly boostService: BoostService) {}

  @Post('grant-free/:userId')
  async grantFreeOnce(@Param('userId', ParseIntPipe) userId: number) {
    await this.boostService.grantFreeOnce(userId);
    return { success: true, userId };
  }
}
