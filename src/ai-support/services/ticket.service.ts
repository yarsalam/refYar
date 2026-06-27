import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TicketMessage, MessageType } from '../entities/ticket-message.entity';
import { TicketFeedback } from '../entities/ticket-feedback.entity';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { User } from '../../users/entities/user.entity';
import { UserEventService } from '../../user-event/user-event.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SupportTicket, TicketStatus } from '../entities/ticket.entity';
import { EventType } from 'src/user-event/type/event-type.enum';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);
  private readonly aiServiceUrl =
    process.env.AI_SUPPORT_URL || 'http://ai_support:8016';

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,

    @InjectRepository(TicketMessage)
    private readonly messageRepo: Repository<TicketMessage>,

    @InjectRepository(TicketFeedback)
    private readonly feedbackRepo: Repository<TicketFeedback>,

    @InjectQueue('ai-support') private readonly aiQueue: Queue,

    private readonly userEventService: UserEventService,
    private readonly httpService: HttpService,
  ) {}

  async createTicket(user: User, dto: CreateTicketDto): Promise<SupportTicket> {
    const ticket = this.ticketRepo.create({
      user,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      metadata: dto.metadata || {},
      status: TicketStatus.OPEN,
    });

    const savedTicket = await this.ticketRepo.save(ticket);

    const message = this.messageRepo.create({
      ticket: savedTicket,
      sender: user,
      type: MessageType.USER,
      content: dto.description,
    });
    await this.messageRepo.save(message);

    await Promise.all([
      this.userEventService.log({
        userId: user.id,
        type: EventType.TICKET_CREATED,
        metadata: { ticketId: savedTicket.id, category: dto.category },
      }),
      this.aiQueue.add('analyze-ticket', {
        ticketId: savedTicket.id,
        content: dto.description,
        userId: user.id,
      }),
    ]);

    return savedTicket;
  }

  async getTicket(ticketId: number): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['user', 'messages', 'messages.sender'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async getUserTickets(userId: number): Promise<SupportTicket[]> {
    return this.ticketRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async addMessage(
    ticketId: number,
    userId: number,
    content: string,
  ): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['user'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const message = this.messageRepo.create({
      ticket,
      sender: { id: userId } as User,
      type: MessageType.USER,
      content,
    });

    const savedMessage = await this.messageRepo.save(message);

    if (ticket.status === TicketStatus.OPEN) {
      await this.aiQueue.add('analyze-ticket', {
        ticketId,
        content,
        userId,
        isUpdate: true,
      });
    }

    return savedMessage;
  }

  async resolveTicket(
    ticketId: number,
    resolution: string,
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['user'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    ticket.status = TicketStatus.RESOLVED;
    ticket.resolvedAt = new Date();

    const systemMessage = this.messageRepo.create({
      ticket,
      type: MessageType.SYSTEM,
      content: `✅ تیکت حل شد: ${resolution}`,
    });
    await this.messageRepo.save(systemMessage);

    return this.ticketRepo.save(ticket);
  }

  async submitFeedback(
    ticketId: number,
    userId: number,
    rating: number,
    comment?: string,
  ): Promise<TicketFeedback> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['user'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const resolutionTime = ticket.resolvedAt
      ? Math.round(
          (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) /
            (1000 * 60),
        )
      : null;

    const feedback = this.feedbackRepo.create({
      ticket,
      user: { id: userId } as User,
      rating,
      comment,
      resolutionTime,
    });

    const saved = await this.feedbackRepo.save(feedback);

    await Promise.all([
      this.aiQueue.add('ticket-feedback', {
        ticketId,
        rating,
        comment,
        resolutionTime,
        ticketData: ticket,
      }),
      this.userEventService.log({
        userId,
        type: EventType.TICKET_FEEDBACK,
        metadata: { ticketId, rating },
      }),
    ]);

    return saved;
  }

  async getAIAnalysis(ticketId: number): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.aiServiceUrl}/api/tickets/${ticketId}/analysis`,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get AI analysis: ${message}`);
      return null;
    }
  }

  async getSEOInsights(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.aiServiceUrl}/api/seo-insights`),
      );
      return response.data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get AI seoInsights: ${message}`);
      return null;
    }
  }

  async findAll(filter: { status?: string; priority?: string }) {
    const query = this.ticketRepo.createQueryBuilder('ticket');
    if (filter.status)
      query.andWhere('ticket.status = :status', { status: filter.status });
    if (filter.priority)
      query.andWhere('ticket.priority = :priority', {
        priority: filter.priority,
      });
    return query.getMany();
  }

  async getTicketDetail(id: number) {
    return this.ticketRepo.findOne({
      where: { id },
      relations: ['user', 'messages'],
    });
  }
}
