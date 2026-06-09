import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { StartConvoDto } from './dto/start-convo.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IcebreakersDto } from './dto/icebreakers.dto';
import { GetUser } from 'src/auth/decorator/get-user/get-user.decorator';

@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Get('advice/:userId')
  async getAdvice(@Param('userId', ParseIntPipe) userId: number) {
    return this.assistant.getAdvice(userId);
  }

  @Post('start')
  async start(@Body() dto: StartConvoDto) {
    return this.assistant.startConversation(
      Number(dto.userId),
      dto.initialMessage,
    );
  }

  @Post('message/:convId')
  async message(@Param('convId') convId: number, @Body() dto: SendMessageDto) {
    return this.assistant.userSendsMessage(convId, dto.message);
  }

  @Get('convos/:userId')
  async list(@Param('userId') userId: number) {
    return this.assistant.listConversationsForUser(userId);
  }

  @Post('icebreakers')
  @UseGuards(JwtAuthGuard)
  async getIcebreakers(
    @GetUser('id') userId: number,
    @Body() dto: IcebreakersDto,
  ) {
    return this.assistant.getIcebreakers(userId, dto.targetUserId);
  }

  @Post('suggest-reply')
  @UseGuards(JwtAuthGuard)
  async suggestReply(
    @GetUser('id') userId: number,
    @Body() body: { message: string },
  ) {
    const reply = await this.assistant.suggestReply(userId, body.message);
    return { reply };
  }

  @Get('guidance/:userId')
  async getNextGuidance(@Param('userId', ParseIntPipe) userId: number) {
    return this.assistant.getNextGuidance(userId);
  }

  @Get('optimization-plan/:userId')
  async getOptimizationPlan(@Param('userId', ParseIntPipe) userId: number) {
    return this.assistant.getOptimizationPlan(userId);
  }

  @Get('problems/:userId')
  async getUserProblems(@Param('userId', ParseIntPipe) userId: number) {
    return this.assistant.getUserProblems(userId);
  }

  @Get('convo/:convId')
  async getConversation(@Param('convId', ParseIntPipe) convId: number) {
    return this.assistant.getConversation(convId);
  }
}
