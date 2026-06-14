import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { FilterUsersDto } from '../dto/FilterUsersDto';
import {
  createUserWithMainImageQuery,
  getUserAvatar,
} from '../../helpers/user-query.helper';

@Injectable()
export class UserFilterService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async filterUsers(filterDto: FilterUsersDto): Promise<User[]> {
    const query = createUserWithMainImageQuery(this.userRepo);

    const arrayFields = [
      'marital',
      'province',
      'city',
      'nationality',
      'education',
      'employment',
      'skin',
      'home',
      'car',
      'health',
      'cigarettes',
      'alcohol',
      'life_style',
      'religion',
      'opinion',
    ];

    for (const key of arrayFields) {
      const value = filterDto[key];
      if (value && Array.isArray(value) && value.length > 0) {
        query.andWhere(`user.${key} IN (:...${key})`, { [key]: value });
      }
    }

    if (filterDto.minHeight) {
      query.andWhere('user.height >= :minHeight', {
        minHeight: +filterDto.minHeight,
      });
    }
    if (filterDto.maxHeight) {
      query.andWhere('user.height <= :maxHeight', {
        maxHeight: +filterDto.maxHeight,
      });
    }
    if (filterDto.minWeight) {
      query.andWhere('user.weight >= :minWeight', {
        minWeight: +filterDto.minWeight,
      });
    }
    if (filterDto.maxWeight) {
      query.andWhere('user.weight <= :maxWeight', {
        maxWeight: +filterDto.maxWeight,
      });
    }

    const currentYear = new Date().getFullYear();
    if (filterDto.minAge) {
      const maxBirthYear = currentYear - +filterDto.minAge;
      query.andWhere('user.birth_year <= :maxBirthYear', { maxBirthYear });
    }
    if (filterDto.maxAge) {
      const minBirthYear = currentYear - +filterDto.maxAge;
      query.andWhere('user.birth_year >= :minBirthYear', { minBirthYear });
    }

    const users = await query.getMany();
    return users.map((user) => ({
      ...user,
      avatar: getUserAvatar(user),
    }));
  }

  async findAllUsersExceptMe(myUserId: number): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userImages', 'images')
      .where('user.id != :myUserId', { myUserId })
      .getMany();
  }
}
