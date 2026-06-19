import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserEventService } from '../../user-event/user-event.service';
import { EventType } from '../../user-event/entities/user-event.entity';

@Injectable()
export class UserCrudService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly userEventService: UserEventService,
  ) {}

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id },
      relations: ['userImages'],
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    let user = await this.userRepo.findOne({
      where: { phone },
      relations: ['userImages', 'phones'],
    });
    if (user) return user;

    user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.phones', 'phones')
      .leftJoinAndSelect('user.userImages', 'userImages')
      .where('phones.phone = :phone', { phone })
      .getOne();
    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepo.create(createUserDto);
    return this.userRepo.save(user);
  }

  // 🔁 نسخهٔ جدید با پارامتر existingUser
  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    existingUser?: User,
  ): Promise<User> {
    try {
      // اگر existingUser پاس داده شده باشد، از همان استفاده می‌کنیم
      const user = existingUser ?? (await this.userRepo.findOneBy({ id }));
      if (!user) throw new NotFoundException('User not found');

      // حذف فیلدهای غیرمرتبط
      delete (updateUserDto as any).platform;
      delete (updateUserDto as any).recaptchaToken;

      // 🔹 فقط یک UPDATE واقعی به دیتابیس
      await this.userRepo.update(id, {
        ...updateUserDto,
        updatedAt: new Date(),
      });

      // 🔹 مارج محلی برای برگرداندن کاربر بروز (بدون SELECT دوباره)
      const merged = { ...user, ...updateUserDto };

      // رویداد به‌صورت fire‑and‑forget (منتظرش نمی‌مانیم)
      this.userEventService
        .log({
          userId: id,
          type: EventType.PROFILE_UPDATE,
          metadata: {
            fields: Object.keys(updateUserDto),
            source: 'users_update',
          },
        })
        .catch((err) => console.error('update event log failed', err));

      return merged as User;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  // نسخهٔ سادهٔ updateDirect که در step1 استفاده می‌کنیم
  async updateDirect(id: number, dto: UpdateUserDto): Promise<void> {
    const result = await this.userRepo.update(id, dto as any);
    if (result.affected === 0) throw new NotFoundException('User not found');
  }

  async findFullProfile(id: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['userImages', 'devices'],
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    return user;
  }

  async findByIds(
    ids: number[],
    options?: { relations?: string[]; select?: string[] },
  ): Promise<User[]> {
    if (!ids.length) return [];
    return this.userRepo.find({
      where: { id: In(ids) },
      relations: options?.relations,
      select: options?.select as any,
    });
  }
}
