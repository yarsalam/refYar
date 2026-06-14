import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramHelper {
  private botToken = process.env.TELEGRAM_BOT_TOKEN;

  async sendTelegramMessage(
    chatId: number | string,
    code: string,
  ): Promise<boolean> {
    try {
      const message = `کد تایید شما: ${code}`;

      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: chatId, // ← نکته مهم
          text: message,
        },
      );

      return true;
    } catch (err: unknown) {
      console.error('Telegram Send Error:', err.response?.data || err);
      return false;
    }
  }
}
