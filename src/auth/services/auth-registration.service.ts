import {
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UserPhonesService } from '../../user-phones/user-phones.service';
import { UserDeviceService } from '../../user-device/user-device.service';
import { TelegramService } from '../channels/telegram/telegram.service';
import { WhatsAppService } from '../channels/whatsapp/whatsapp.service';
import { RedisService } from '../../redis/redis.service';
import { DevicePhoneService } from '../device-phone/device-phone.service';
import { DevicePhoneEvent } from '../device-phone/entities/device-phone.entity';
import { UserEventService } from '../../user-event/user-event.service';
import { EventType } from '../../user-event/entities/user-event.entity';
import { PhaseService } from '../../phase/phase.service';
import { CreateAuthDto } from '../dto/create-auth.dto';
import { CompleteProfileDto } from '../dto/complete-profile.dto';
import { UpdateUserDto } from '../../users/dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from 'src/users/entities/user.entity';

// 🕒 helper امن برای اندازه‌گیری زمان (بدون state سراسری)
function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  return fn().finally(() =>
    console.log(`${label}: ${(performance.now() - start).toFixed(1)}ms`),
  );
}

@Injectable()
export class AuthRegistrationService {
  private readonly logger = new Logger(AuthRegistrationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly userPhonesService: UserPhonesService,
    private readonly userDeviceService: UserDeviceService,
    private readonly telegramService: TelegramService,
    private readonly whatsappService: WhatsAppService,
    private readonly redis: RedisService,
    private readonly devicePhoneService: DevicePhoneService,
    private readonly userEventService: UserEventService,
    private readonly phaseService: PhaseService,
  ) {}

  async step1(createAuthDto: CreateAuthDto, req: Request) {
    const totalStart = Date.now();

    try {
      // ۱. پیدا کردن کاربر
      const existingUser = await timed('findByPhone', () =>
        this.usersService.findByPhone(createAuthDto.phone),
      );

      if (existingUser?.isCompleted) {
        throw new HttpException(
          { message: 'این شماره قبلاً ثبت‌نام کرده.', code: 'EXISTING_USER' },
          HttpStatus.CONFLICT,
        );
      }

      const { recaptchaToken, platform, ...userData } = createAuthDto;

      let user: User;
      if (existingUser) {
        // فقط یک UPDATE ساده (updateDirect) + merge محلی
        await timed('updateUser', () =>
          this.usersService.updateDirect(existingUser.id, userData),
        );
        Object.assign(existingUser, userData);
        user = existingUser;
      } else {
        user = await timed('createUser', () =>
          this.usersService.create({
            ...userData,
            metadata: { acquisitionSource: req.headers['referer'] || 'direct' },
          }),
        );
      }

      // ۲. عملیات مستقل
      const ci = (req as any).clientInfo || {};
      const deviceId =
        ci.deviceId ||
        `srv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // افزودن شماره تلفن (فقط کاربر جدید)
      if (!existingUser) {
        await timed('addFirstPhone', () =>
          this.userPhonesService.addFirstPhone(user.id, createAuthDto.phone),
        );
      }

      // رویداد login (fire‑and‑forget)
      this.userEventService
        .log({
          userId: user.id,
          type: EventType.LOGIN,
          metadata: { via: 'signup', platform: createAuthDto.platform },
        })
        .catch((err) => console.error('Event log failed', err));

      // ساخت/بروزرسانی دستگاه
      const device = await timed('createOrUpdateDevice', () =>
        this.userDeviceService.createOrUpdateToken({
          userId: user.id,
          userAgent: (req.headers['user-agent'] as string) || 'unknown',
          ipAddress: ci.ip || '0.0.0.0',
          deviceId,
          platform: ['web', 'mobile'].includes(ci.platform ?? '')
            ? (ci.platform as 'web' | 'mobile')
            : 'web',
          brand: ci.brand,
          model: ci.model,
          osVersion: ci.osVersion,
          appVersion: ci.appVersion,
          country: ci.country,
          city: ci.city,
          isVpn: ci.isVpn,
        }),
      );

      // ۳. ثبت ارتباط دستگاه-شماره (حالا fire‑and‑forget)
      if (device) {
        this.devicePhoneService
          .logEvent({
            device,
            phone: createAuthDto.phone,
            event: DevicePhoneEvent.SEEN,
          })
          .catch((err) => console.error('devicePhone logEvent failed', err));
      }

      console.log(`[step1] TOTAL TIME: ${Date.now() - totalStart}ms`);
      return;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException('خطا در پردازش درخواست');
    }
  }

  async completeVerification(phone: string, clientDeviceId: string) {
    const verified =
      (await this.whatsappService.isVerified(phone)) ||
      (await this.telegramService.isVerified(phone));

    if (!verified) {
      throw new UnauthorizedException('Not verified yet');
    }

    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      throw new UnauthorizedException('User not created in step1');
    }

    await this.userPhonesService.markAsVerified(user.id, phone);

    const device =
      await this.userDeviceService.findByClientDeviceId(clientDeviceId);
    if (!device) throw new BadRequestException('DEVICE_NOT_FOUND');

    await this.devicePhoneService.logEvent({
      device,
      phone,
      event: DevicePhoneEvent.VERIFIED,
      verified: true,
    });

    await Promise.all([
      this.userEventService.log({
        userId: user.id,
        type: EventType.APP_OPEN,
        metadata: { via: 'verification' },
      }),
      this.redis.del(`tg:verified:${phone}`),
    ]);

    const payload = { sub: user.id, phone, temporary: true };
    const token = this.jwtService.sign(payload, { expiresIn: '30m' });

    return { message: 'Verified successfully', token };
  }

  async completeProfile(dto: CompleteProfileDto, userFromReq: any) {
    try {
      const userId = Number(userFromReq?.sub);
      const isTemporary = userFromReq?.temporary === true;
      if (!userId) throw new UnauthorizedException('کاربر معتبر نیست');
      if (!isTemporary)
        throw new UnauthorizedException(
          'توکن معتبر نیست یا مرحله قبلی انجام نشده است',
        );

      const user = await this.usersService.findById(userId);
      if (!user) throw new UnauthorizedException('کاربر یافت نشد');

      const changedFields: string[] = [];
      if (dto.nickname !== undefined) changedFields.push('nickname');
      if (dto.birthDate)
        changedFields.push('birth_year', 'birth_month', 'birth_day');
      if (dto.marital !== undefined) changedFields.push('marital');
      if (dto.province !== undefined) changedFields.push('province');
      if (dto.city !== undefined) changedFields.push('city');
      if (dto.nationality !== undefined) changedFields.push('nationality');
      if (dto.education !== undefined) changedFields.push('education');
      if (dto.employment !== undefined) changedFields.push('employment');
      if (dto.height !== undefined) changedFields.push('height');
      if (dto.weight !== undefined) changedFields.push('weight');
      if (dto.health !== undefined) changedFields.push('health');
      if (dto.religion !== undefined) changedFields.push('religion');
      if (dto.aboutme !== undefined) changedFields.push('aboutme');
      if (dto.values_self !== undefined) changedFields.push('values_self');
      if (dto.hobbies_self !== undefined) changedFields.push('hobbies_self');
      if (dto.partner_about !== undefined) changedFields.push('partner_about');
      if (dto.values_partner !== undefined)
        changedFields.push('values_partner');
      if (dto.hobbies_partner !== undefined)
        changedFields.push('hobbies_partner');

      const updateData: Partial<UpdateUserDto> = {
        nickname: dto.nickname,
        birth_day: dto.birthDate.day,
        birth_month: dto.birthDate.month,
        birth_year: dto.birthDate.year,
        marital: dto.marital,
        province: dto.province,
        city: dto.city,
        nationality: dto.nationality,
        education: dto.education,
        employment: dto.employment,
        height: dto.height,
        weight: dto.weight,
        health: dto.health,
        religion: dto.religion,
        aboutme: dto.aboutme,
        values_self: dto.values_self,
        hobbies_self: dto.hobbies_self,
        partner_about: dto.partner_about,
        values_partner: dto.values_partner,
        hobbies_partner: dto.hobbies_partner,
        isCompleted: true,
      };

      if (dto.password?.trim()) {
        updateData.password = await bcrypt.hash(dto.password, 10);
        changedFields.push('password');
      }

      const updatedUser = await this.usersService.update(userId, updateData);
      if (!updatedUser)
        throw new InternalServerErrorException('به‌روزرسانی ناموفق');

      const events: Promise<any>[] = [
        this.phaseService.learnFromFeedback(userId, 'profile_completed'),
        this.userPhonesService.markAsActived(userId, updatedUser.phone),
      ];
      if (changedFields.length > 0) {
        events.push(
          this.userEventService.log({
            userId,
            type: EventType.PROFILE_UPDATE,
            metadata: { fields: changedFields, source: 'complete_profile' },
          }),
        );
      }
      if (dto.password?.trim()) {
        events.push(
          this.userEventService.log({
            userId,
            type: EventType.PASSWORD_CHANGE,
            metadata: { via: 'complete_profile' },
          }),
        );
      }
      await Promise.all(events);

      const finalPayload = { sub: updatedUser.id, phone: updatedUser.phone };
      const finalToken = this.jwtService.sign(finalPayload, {
        expiresIn: '30d',
      });

      return { user: updatedUser, token: finalToken };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException('خطا در تکمیل پروفایل');
    }
  }
}
