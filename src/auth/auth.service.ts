import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { CreateAuthDto } from './dto/create-auth.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { AuthRegistrationService } from './services/auth-registration.service';
import { AuthLoginService } from './services/auth-login.service';
import { AuthProfileService } from './services/auth-profile.service';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly registration: AuthRegistrationService,
    private readonly loginService: AuthLoginService,
    private readonly profileService: AuthProfileService,
    private readonly usersService: UsersService,
  ) {}

  async step1(createAuthDto: CreateAuthDto, req: Request) {
    return this.registration.step1(createAuthDto, req);
  }

  async completeVerification(phone: string, clientDeviceId: string) {
    return this.registration.completeVerification(phone, clientDeviceId);
  }

  async completeProfile(dto: CompleteProfileDto, userFromReq: any) {
    return this.registration.completeProfile(dto, userFromReq);
  }

  async login(phone: string, password: string) {
    return this.loginService.login(phone, password);
  }

  async getProfile(payload: any) {
    return this.profileService.getProfile(payload);
  }

  async changePassword(userId: number, newPassword: string) {
    return this.profileService.changePassword(userId, newPassword);
  }

  async getRegisterStatus(phone: string) {
    return this.profileService.getRegisterStatus(phone);
  }

  async simLogin(phone: string, gender: string) {
    let user = await this.usersService.findByPhone(phone);
    if (user) return user;

    // ساخت کاربر کامل با پروفایل پیش‌فرض
    user = await this.usersService.create({
      phone,
      gender,
      isCompleted: true,
      nickname: `sim_${phone.slice(-4)}`,
      city: 'تهران',
      province: 'تهران',
      birth_year: '1375',
      birth_month: '06',
      birth_day: '15',
      marital: 'single',
      education: 'bachelor',
      employment: 'employee',
      aboutme: 'کاربر تست سیمولاتور',
      hobbies_self: ['ورزش', 'کتاب‌خوانی'],
      values_self: ['صداقت', 'مهربانی'],
    } as any);

    return user;
  }
}
