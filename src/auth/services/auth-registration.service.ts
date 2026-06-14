import {
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
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

@Injectable()
export class AuthRegistrationService {
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
    try {
      const existingUser = await this.usersService.findByPhone(
        createAuthDto.phone,
      );
      if (existingUser?.isCompleted) {
        throw new HttpException(
          { message: 'این شماره قبلاً ثبت‌نام کرده.', code: 'EXISTING_USER' },
          HttpStatus.CONFLICT,
        );
      }

      const { recaptchaToken, platform, ...userData } = createAuthDto;

      let user;
      if (existingUser) {
        user = await this.usersService.update(existingUser.id, userData);
      } else {
        user = await this.usersService.create({
          ...userData,
          metadata: { acquisitionSource: req.headers['referer'] || 'direct' },
        });
        await this.userPhonesService.addFirstPhone(
          user.id,
          createAuthDto.phone,
        );
      }

      await this.userEventService.log({
        userId: user.id,
        type: EventType.LOGIN,
        metadata: { via: 'signup', platform: createAuthDto.platform },
      });

      const ci = (req as any).clientInfo!;
      const device = await this.userDeviceService.createOrUpdateToken({
        userId: user.id,
        userAgent: req.headers['user-agent'] as string,
        ipAddress: ci.ip,
        deviceId: ci.deviceId!,
        platform: ['web', 'mobile'].includes(ci.platform ?? '')
          ? (ci.platform as 'web' | 'mobile')
          : undefined,
        brand: ci.brand,
        model: ci.model,
        osVersion: ci.osVersion,
        appVersion: ci.appVersion,
        country: ci.country,
        city: ci.city,
        isVpn: ci.isVpn,
      });

      await this.devicePhoneService.logEvent({
        device,
        phone: createAuthDto.phone,
        event: DevicePhoneEvent.SEEN,
      });

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

    await this.userEventService.log({
      userId: user.id,
      type: EventType.APP_OPEN,
      metadata: { via: 'verification' },
    });

    await this.redis.del(`tg:verified:${phone}`);

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

      if (dto.password && dto.password.trim()) {
        updateData.password = await bcrypt.hash(dto.password, 10);
        changedFields.push('password');
      }

      const updatedUser = await this.usersService.update(userId, updateData);

      if (changedFields.length > 0) {
        await this.userEventService.log({
          userId,
          type: EventType.PROFILE_UPDATE,
          metadata: { fields: changedFields, source: 'complete_profile' },
        });
      }

      if (dto.password && dto.password.trim()) {
        await this.userEventService.log({
          userId,
          type: EventType.PASSWORD_CHANGE,
          metadata: { via: 'complete_profile' },
        });
      }

      if (!updatedUser)
        throw new InternalServerErrorException('به‌روزرسانی ناموفق');

      await this.phaseService.learnFromFeedback(userId, 'profile_completed');

      const finalPayload = { sub: updatedUser.id, phone: updatedUser.phone };
      const finalToken = this.jwtService.sign(finalPayload, {
        expiresIn: '30d',
      });

      await this.userPhonesService.markAsActived(userId, updatedUser.phone);
      return { user: updatedUser, token: finalToken };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException('خطا در تکمیل پروفایل');
    }
  }
}
