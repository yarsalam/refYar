import { Injectable } from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class WhatsAppService {
  constructor(private readonly redis: RedisService) {}

  async saveOtp(phone: string, otp: string) {
    await this.redis.set(`wa:otp:${phone}`, otp, 300);
    await this.redis.del(`wa:verified:${phone}`);

    // نگاشت phone -> wa sender
    await this.redis.set(`wa:map:${phone}`, 'pending', 300);
    const testOtp = await this.redis.get(`wa:otp:${phone}`);
    return { ok: true };
  }

  async handleIncomingMessage(sender: string, text: string) {
    // فقط اجازه OTP شش رقمی
    const otpMatch = text.match(/\b\d{6}\b/);
    if (!otpMatch) {
      return;
    }

    const otp = otpMatch[0];

    // گرفتن کلیدهای OTP
    const keys = await this.redis.scanKeys('wa:otp:*');

    for (const key of keys) {
      const phone = key.replace('wa:otp:', '');
      const expectedOtp = await this.redis.get(key);
      const map = await this.redis.get(`wa:map:${phone}`);

      if (map !== 'pending') continue;

      if (expectedOtp === otp) {
        await this.redis.set(`wa:map:${phone}`, sender, 300);
        await this.redis.set(`wa:verified:${phone}`, '1', 300);
        await this.redis.del(key);

        return;
      }
    }
  }

  async isVerified(phone: string) {
    const result = !!(await this.redis.get(`wa:verified:${phone}`));
    return !!result;
  }
}
