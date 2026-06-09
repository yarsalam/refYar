import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AdminApiGuard } from '../../guards/api-key.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModerationLog } from '../../../moderation/entities/moderation-log.entity';
import { UserImage } from '../../../user_images/entities/user_image.entity';
import { Message } from '../../../message/entities/message.entity';

@Controller('admin-api/safety/moderation')
@UseGuards(AdminApiGuard)
export class SafetyModerationController {
  constructor(
    @InjectRepository(ModerationLog)
    private modLogRepo: Repository<ModerationLog>,

    @InjectRepository(UserImage)
    private imageRepo: Repository<UserImage>,

    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
  ) {}

  @Get('flagged-images')
  async getFlaggedImages() {
    // Return images with moderationStatus != 'approved'
    return this.imageRepo.find({ where: { moderationStatus: 'flagged' } });
  }

  @Get('flagged-messages')
  async getFlaggedMessages() {
    return this.messageRepo.find({ where: { moderationStatus: 'flagged' } });
  }

  @Post('approve/:type/:id')
  async approveContent(
    @Param('type') type: 'image' | 'message',
    @Param('id') id: number,
  ) {
    if (type === 'image') {
      await this.imageRepo.update(id, { moderationStatus: 'approved' });
    } else {
      await this.messageRepo.update(id, { moderationStatus: 'approved' });
    }
    return { success: true };
  }

  @Post('reject/:type/:id')
  async rejectContent(
    @Param('type') type: 'image' | 'message',
    @Param('id') id: number,
  ) {
    if (type === 'image') {
      await this.imageRepo.update(id, { moderationStatus: 'rejected' });
    } else {
      await this.messageRepo.update(id, { moderationStatus: 'rejected' });
    }
    return { success: true };
  }

  @Get('stats')
  async getStats() {
    const [totalImages, flaggedImages] = await Promise.all([
      this.imageRepo.count(),
      this.imageRepo.count({ where: { moderationStatus: 'flagged' } }),
    ]);
    return { totalImages, flaggedImages };
  }

  @Get('logs/:userId')
  async getLogsForUser(@Param('userId') userId: number) {
    return this.modLogRepo.find({ where: { userId } });
  }
}
