import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ProfileVisitorsService } from './profile-visitors.service';
import { CreateProfileVisitorDto } from './dto/create-profile-visitor.dto';

@Controller('profile-visitors')
export class ProfileVisitorsController {
  constructor(
    private readonly profileVisitorsService: ProfileVisitorsService,
  ) {}

  @Post()
  create(@Body() dto: CreateProfileVisitorDto) {
    // رفع باگ: ترتیب صحیح visitorId, profileId
    return this.profileVisitorsService.createVisitor(
      dto.visitorId,
      dto.profileId,
    );
  }

  @Get(':profileId')
  getProfileVisitors(@Param('profileId', ParseIntPipe) profileId: number) {
    return this.profileVisitorsService.getProfileVisitors(profileId);
  }
}
