import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Body,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { GetUser } from 'src/auth/decorator/get-user/get-user.decorator';
import { AdminApiGuard } from 'src/admin-api/guards/api-key.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getUserNotifications(@GetUser('id') userId: number) {
    return this.notificationService.getUserNotifications(userId);
  }

  @Patch('read/:id')
  markAsRead(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationService.markAsRead(id, userId);
  }

  @Get('unread/count')
  countUnread(@GetUser('id') userId: number) {
    return this.notificationService.countUnread(userId);
  }

  @Post()
  @UseGuards(AdminApiGuard)
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationService.createNotification(dto);
  }
}
