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

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User | null> {
    try {
      const existingUser = await this.userRepo.findOneBy({ id });
      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      const changedFields: string[] = [];
      for (const key in updateUserDto) {
        if (updateUserDto[key] !== existingUser[key]) {
          changedFields.push(key);
        }
      }

      delete (updateUserDto as any).platform;
      delete (updateUserDto as any).recaptchaToken;

      const result = await this.userRepo.update(id, {
        ...updateUserDto,
        updatedAt: new Date(),
      });

      if (result.affected === 0) {
        throw new NotFoundException('User not found or no changes made');
      }

      const updatedUser = await this.userRepo.findOneBy({ id });

      if (changedFields.length > 0) {
        await this.userEventService.log({
          userId: id,
          type: EventType.PROFILE_UPDATE,
          metadata: { fields: changedFields, source: 'users_update' },
        });
      }

      return updatedUser;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to update user');
    }
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
