import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { OtpService } from 'src/auth/otp/otp.service';
import { VerifyCodeDto } from 'src/auth/dto/verify-code.dto';
import { RedisService } from 'src/redis/redis.service';

@Controller('telegram/webhook')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly otpService: OtpService,
    private readonly redis: RedisService,
  ) {}

  @Post()
  async handleUpdate(@Body() update: any) {
    const chatId = update.message?.chat?.id;
    const text = update.message?.text?.trim();

    if (!chatId || !text) return 'NO_DATA';

    let phone: string | null = null;

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        phone = parts[1];
      }
    }

    if (!phone) {
      return 'NO_PHONE';
    }

    await this.telegramService.saveChatId(phone, chatId);

    let code = await this.redis.get(`otp:${phone}`);

    if (!code) {
      code = await this.otpService.generate(phone);
      await this.telegramService.sendCode(phone, code);
    } else {
      console.log('⏳ OTP already exists, not resending');
    }

    return 'OK';
  }

  @Post('verify')
  async verifyTelegram(@Body() dto: VerifyCodeDto) {
    await this.otpService.verify(dto.phone, dto.code);
    await this.redis.set(`tg:verified:${dto.phone}`, '1', 600);
    return { success: true };
  }
}
