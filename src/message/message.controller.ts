import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
  HttpException,
  HttpStatus,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { PaywallException } from 'src/payments/paywall/paywall.exception';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { GetUser } from 'src/auth/decorator/get-user/get-user.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  // رفع باگ: اضافه کردن @Post() + امنیت from_id از JWT
  @Post()
  async send(@GetUser('id') userId: number, @Body() dto: CreateMessageDto) {
    // از_id را از JWT می‌گیریم، نه از body
    dto.from_id = userId;
    try {
      return await this.messageService.sendMessage(dto);
    } catch (error: unknown) {
      if (error instanceof PaywallException) {
        throw new HttpException(
          {
            statusCode: 402,
            message: 'اعتبار کافی ندارید',
            paywall: error.payload,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw error;
    }
  }

  // استفاده از JWT به جای userId در URL
  @Get('inbox')
  inbox(@GetUser('id') userId: number, @Query('is_free') isFree?: string) {
    return this.messageService.getInbox(
      userId,
      isFree === 'true' ? true : undefined,
    );
  }

  @Get('sent')
  sent(@GetUser('id') userId: number, @Query('is_free') isFree?: string) {
    return this.messageService.getSent(
      userId,
      isFree === 'true' ? true : undefined,
    );
  }

  @Patch('read/:id')
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.messageService.markAsRead(id);
  }

  @Delete('inbox/:id')
  deleteFromInbox(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.messageService.deleteFromInbox(id, userId);
  }

  @Delete('sent/:id')
  deleteFromSent(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.messageService.deleteFromSent(id, userId);
  }

  @Get('inbox/grouped')
  inboxGrouped(@GetUser('id') userId: number) {
    return this.messageService.getInboxGroupedByUser(userId);
  }

  @Get('sent/grouped')
  sentGrouped(@GetUser('id') userId: number) {
    return this.messageService.getSentGroupedByUser(userId);
  }

  // امنیت: فقط مکالمه‌های خود کاربر از JWT
  @Get('conversation/:targetId')
  async getConversation(
    @GetUser('id') userId: number,
    @Param('targetId', ParseIntPipe) targetId: number,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.messageService.getConversation(userId, targetId, page, limit);
  }

  @Patch(':id')
  async editMessage(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('content') content: string,
  ) {
    return this.messageService.editMessage(id, userId, content);
  }

  @Post(':id/report')
  async reportMessage(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.messageService.reportMessage(id, userId);
  }

  @Get('unread-count')
  async unreadCount(@GetUser('id') userId: number) {
    return this.messageService.getTotalUnreadCount(userId);
  }

  @Delete('all')
  async deleteAllMessages(@GetUser('id') userId: number) {
    return this.messageService.deleteAllMessages(userId);
  }

  @Delete('conversation/:targetUserId')
  async deleteConversation(
    @GetUser('id') userId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
  ) {
    return this.messageService.deleteConversation(userId, targetUserId);
  }

  @Patch('read-all/:targetUserId')
  async markAllAsRead(
    @GetUser('id') userId: number,
    @Param('targetUserId', ParseIntPipe) targetUserId: number,
  ) {
    return this.messageService.markAllAsRead(userId, targetUserId);
  }
}
