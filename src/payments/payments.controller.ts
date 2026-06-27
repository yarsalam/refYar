import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AdminApiGuard } from 'src/admin-api/guards/api-key.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('grant-bundle/:userId/:bundleCode')
  @UseGuards(AdminApiGuard)
  async grantBundle(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('bundleCode') bundleCode: string,
  ) {
    await this.paymentsService.grantBundle(userId, bundleCode);
    return { success: true, userId, bundleCode };
  }
}
