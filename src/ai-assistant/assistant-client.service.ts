import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AssistantClientService {
  private readonly logger = new Logger(AssistantClientService.name);
  private readonly aiUrl =
    process.env.AI_ASSISTANT_URL || 'http://ai_assistant:8022';

  constructor(private readonly httpService: HttpService) {}

  async analyzeUser(
    userId: number,
    bio: string,
    messages: string[],
    events: any[],
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiUrl}/api/assistant/analyze`, {
          user_id: userId,
          bio,
          messages,
          events,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to analyze user: ${error.message}`);
      return null;
    }
  }

  async getAdvice(userId: number) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.aiUrl}/api/assistant/advice/${userId}`),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get advice: ${error.message}`);
      return null;
    }
  }
}
