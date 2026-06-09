import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminApiGuard } from '../../guards/api-key.guard';
import { TicketService } from '../../../ai-support/services/ticket.service';

@Controller('admin-api/safety/tickets')
@UseGuards(AdminApiGuard)
export class SafetyTicketsController {
  constructor(private readonly ticketService: TicketService) {}

  @Get()
  getAll(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.ticketService.findAll({ status, priority });
  }

  @Get(':id')
  getDetail(@Param('id') id: number) {
    return this.ticketService.getTicketDetail(id);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: number, @Body('resolution') resolution: string) {
    return this.ticketService.resolveTicket(id, resolution);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id') id: number,
    @Body() body: { userId: number; content: string },
  ) {
    return this.ticketService.addMessage(id, body.userId, body.content);
  }
}
