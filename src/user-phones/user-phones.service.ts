import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPhone } from './entities/user-phone.entity';
import { CreateUserPhoneDto } from './dto/create-user-phone.dto';
import { User } from 'src/users/entities/user.entity';
import { Request } from 'express';
import { RedisService } from 'src/redis/redis.service';
import { WhatsAppService } from 'src/auth/channels/whatsapp/whatsapp.service';
import { TelegramService } from 'src/auth/channels/telegram/telegram.service';
import { UserEventService } from 'src/user-event/user-event.service';
import { EventType } from 'src/user-event/entities/user-event.entity';

@Injectable()
export class UserPhonesService {
  constructor(
    @InjectRepository(UserPhone)
    private readonly userPhonesRepo: Repository<UserPhone>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly redis: RedisService,

    private readonly whatsapp: WhatsAppService,
    private readonly telegram: TelegramService,
    private readonly userEventService: UserEventService,
  ) {}

  async addNewPhone(userId: number, dto: CreateUserPhoneDto, req: Request) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['phones'],
    });
    if (!user) throw new BadRequestException('کاربر یافت نشد');

    if (user.phone !== dto.phone) {
      await this.userEventService.log({
        userId,
        type: EventType.PHONE_CHANGE,
        metadata: {
          oldPhone: user.phone,
          newPhone: dto.phone,
          via: dto.channel,
        },
      });
    }
    // آخرین شماره در ۱۰ روز گذشته
    const lastPhone = await this.userPhonesRepo.findOne({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    if (lastPhone) {
      const now = Date.now();
      const diff = now - lastPhone.createdAt.getTime();
      if (diff < 10 * 24 * 60 * 60 * 1000)
        throw new BadRequestException(
          'امکان تغییر شماره هر ۱۰ روز یکبار می‌باشد',
        );
    }

    // قبلاً اضافه شده؟
    const existing = user.phones.find((p) => p.phone === dto.phone);

    if (existing && existing.isVerified)
      throw new BadRequestException('این شماره قبلاً استفاده شده است.');

    // تولید OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    if (dto.channel === 'telegram') {
      // ذخیره OTP
      await this.redis.set(`otp:${dto.phone}`, otp, 300);

      await this.telegram.sendCode(dto.phone, otp);
    } else if (dto.channel === 'whatsapp') {
      // OTP سمت فرانت تولید شده → فقط ذخیره و انتظار پیام واتساپ
      await this.whatsapp.saveOtp(dto.phone, otp);
    }

    if (!existing) {
      const newPhone = this.userPhonesRepo.create({
        phone: dto.phone,
        user,
        isVerified: false,
        isActive: false,
      });
      await this.userPhonesRepo.save(newPhone);
    }

    return { message: 'کد ارسال شد', phone: dto.phone };
  }

  async verifyCode(
    userId: number,
    dto: {
      phone: string;
      code?: string;
      channel: 'telegram' | 'whatsapp';
    },
  ) {
    const userPhone = await this.userPhonesRepo.findOne({
      where: { phone: dto.phone },
      relations: ['user', 'user.phones'],
    });
    if (!userPhone) throw new BadRequestException('شماره یافت نشد');

    // -------------------------
    // 🔵 Telegram verification
    // -------------------------
    if (dto.channel === 'telegram') {
      if (!dto.code) throw new BadRequestException('کد الزامی است');

      const stored = await this.redis.get(`otp:${dto.phone}`);

      if (!stored || stored !== dto.code) {
        throw new BadRequestException('کد اشتباه یا منقضی شده است');
      }

      // OTP درست بود → پاکش کنیم
      await this.redis.del(`otp:${dto.phone}`);
    }

    // -------------------------
    // 🟢 WhatsApp verification
    // -------------------------
    if (dto.channel === 'whatsapp') {
      const ok = await this.whatsapp.isVerified(dto.phone);

      if (!ok)
        throw new BadRequestException('کد هنوز در واتساپ تأیید نشده است');
    }

    // -------------------------
    // 🔥 اکنون شماره Verified است
    // -------------------------
    userPhone.isVerified = true;
    userPhone.isActive = true;

    const user = userPhone.user;

    // بقیه شماره‌ها غیرفعال شوند
    user.phones.forEach((p) => {
      if (p.id !== userPhone.id) p.isActive = false;
    });

    // شماره اصلی کاربر
    user.phone = userPhone.phone;

    await this.userPhonesRepo.save(user.phones);
    await this.userRepo.save(user);

    return { success: true, phone: userPhone.phone };
  }

  async getAllPhones(userId: number) {
    return this.userPhonesRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async addFirstPhone(userId: number, phone: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['phones'],
    });
    if (!user) throw new BadRequestException('کاربر یافت نشد');

    const existingPhone = user.phones.find((p) => p.phone === phone);
    if (existingPhone) {
      throw new BadRequestException('این شماره قبلاً استفاده شده است.');
    }

    const newPhone = this.userPhonesRepo.create({
      user,
      phone,
      isVerified: false,
      isActive: false,
    });
    await this.userPhonesRepo.save(newPhone);

    return newPhone;
  }

  async markAsVerified(userId: number, phone: string) {
    await this.userPhonesRepo.update(
      { user: { id: userId }, phone },
      {
        isVerified: true,
        verifiedAt: new Date(),
      },
    );
  }
  async markAsActived(userId: number, phone: string) {
    await this.userPhonesRepo.update(
      { user: { id: userId }, phone },
      {
        isActive: true,
        verifiedAt: new Date(),
      },
    );
  }
}
