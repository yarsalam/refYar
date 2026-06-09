import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Not, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { FilterUsersDto } from './dto/FilterUsersDto';
import {
  createUserWithMainImageQuery,
  getUserAvatar,
} from 'src/helpers/user-query.helper';
import { FindCandidatesOptions } from 'src/types/find-candidates-options.interface';
import { EventType } from 'src/user-event/entities/user-event.entity';
import { UserEventService } from 'src/user-event/user-event.service';
import { FeatureStoreService } from 'src/feature-store/feature-store.service';
import { RelationStatusService } from 'src/relation-status/relation-status.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @Inject(forwardRef(() => FeatureStoreService))
    private readonly featureStore: FeatureStoreService,

    private readonly userEventService: UserEventService,
    private readonly relationStatus: RelationStatusService,
  ) {}

  private getDateFromAge(age: number): Date {
    const today = new Date();
    return new Date(
      today.getFullYear() - age,
      today.getMonth(),
      today.getDate(),
    );
  }

  async findByPhone(phone: string): Promise<User | null> {
    // جستجو در ستون phone اصلی
    let user = await this.userRepository.findOne({
      where: { phone },
      relations: ['userImages', 'phones'],
    });

    if (user) return user;

    // جستجو در جدول user_phones
    user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.phones', 'phones')
      .leftJoinAndSelect('user.userImages', 'userImages')
      .where('phones.phone = :phone', { phone })
      .getOne();
    return user;
  }

  async findById(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['userImages'], // این مهمه
    });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }
    return user;
  }

  create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create({
      ...createUserDto,
    });
    return this.userRepository.save(user);
  }

  async findAllUsersExceptMe(myUserId: number): Promise<User[]> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userImages', 'images')
      .where('user.id != :myUserId', { myUserId })
      .getMany();
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  // users.service.ts
  async update(id: number, updateUserDto: any): Promise<User | null> {
    try {
      // بررسی وجود کاربر
      const existingUser = await this.userRepository.findOneBy({ id });
      if (!existingUser) {
        throw new NotFoundException('User not found');
      }
      const changedFields: string[] = [];
      for (const key in updateUserDto) {
        if (updateUserDto[key] !== existingUser[key]) {
          changedFields.push(key);
        }
      }
      delete updateUserDto.platform;
      delete updateUserDto.recaptchaToken;
      const result = await this.userRepository.update(id, {
        ...updateUserDto,
        updatedAt: new Date(),
      });

      if (result.affected === 0) {
        throw new NotFoundException('User not found or no changes made');
      }

      // گرفتن کاربر آپدیت شده
      const updatedUser = await this.userRepository.findOneBy({ id });

      if (changedFields.length > 0) {
        await this.userEventService.log({
          userId: id,
          type: EventType.PROFILE_UPDATE,
          metadata: {
            fields: changedFields,
            source: 'users_update',
          },
        });
      }

      return updatedUser;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to update user: ' + error.message,
      );
    }
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }

  async filterUsers(filterDto: FilterUsersDto): Promise<User[]> {
    const query = createUserWithMainImageQuery(this.userRepository); // فقط تصویر اصلی

    // فیلترهای آرایه‌ای
    const arrayFields: (keyof FilterUsersDto)[] = [
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

    // فیلتر بازه‌ای قد
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

    // فیلتر بازه‌ای وزن
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

    // فیلتر بازه‌ای سن
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

  findCandidates(options: FindCandidatesOptions) {
    const query = this.userRepository.createQueryBuilder('user');

    if (options.excludeUserId) {
      query.andWhere('user.id != :id', { id: options.excludeUserId });
    }

    if (options.gender) {
      query.andWhere('user.gender = :gender', { gender: options.gender });
    }

    if (options.city) {
      query.andWhere('user.city = :city', { city: options.city });
    }

    if (options.ageFrom) {
      query.andWhere(
        "CONCAT(user.birth_year,'-',user.birth_month,'-',user.birth_day) <= :fromDate",
        { fromDate: this.getDateFromAge(options.ageFrom) },
      );
    }

    if (options.ageTo) {
      query.andWhere(
        "CONCAT(user.birth_year,'-',user.birth_month,'-',user.birth_day) >= :toDate",
        { toDate: this.getDateFromAge(options.ageTo) },
      );
    }

    if (options.onlyCompleted) {
      query.andWhere('user.isCompleted = true');
    }

    // فقط آنلاین‌ها
    if (options.onlyOnline) {
      query.andWhere('user.isOnline = true');
    }

    return query.getMany();
  }

  async findSeedProfiles(options?: { limit?: number; city?: string }) {
    const query = this.userRepository
      .createQueryBuilder('user')
      .where('user.isCompleted = true');

    if (options?.city)
      query.andWhere('user.city = :city', { city: options.city });

    return query
      .orderBy('RAND()')
      .limit(options?.limit ?? 10)
      .getMany();
  }

  async getActiveUserIds(limit = 1000): Promise<number[]> {
    const users = await this.userRepository.find({
      where: { status: 'active' },
      select: ['id'],
      take: limit,
    });

    return users.map((u) => u.id);
  }

  async findByIds(
    ids: number[],
    options?: {
      relations?: string[];
      select?: (keyof User)[];
    },
  ): Promise<User[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    return this.userRepository.find({
      where: { id: In(ids) },
      relations: options?.relations || [],
      select: options?.select,
    });
  }

  async findRecentSimilarUsers(
    userId: number,
    limit: number = 5,
    daysAgo: number = 30,
  ): Promise<any[]> {
    const since = new Date();
    since.setDate(since.getDate() - daysAgo);

    // کاربران جدید (بدون خود کاربر)
    const recentUsers = await this.userRepository.find({
      where: {
        createdAt: MoreThan(since),
        id: Not(userId), // 🆕
      },
      relations: ['userImages'],
      select: [
        'id',
        'nickname',
        'city',
        'gender',
        'birth_year',
        'aboutme',
        'hobbies_self',
        'values_self',
        'isFaceVerified',
        'trustScore',
        'education',
        'marital',
      ],
    });

    if (recentUsers.length === 0) return [];

    // دریافت وضعیت رابطه برای همهٔ کاربران یکجا
    const ids = recentUsers.map((u) => u.id);
    const relationsMap = await this.relationStatus.getEffectiveRelationsBatch(
      userId,
      ids,
    );

    // حذف بلاک‌شده‌ها
    let filteredUsers = recentUsers.filter(
      (u) => !relationsMap.get(u.id)?.isBlocked,
    );
    if (filteredUsers.length === 0) return [];

    // امتیاز شباهت (در صورت وجود snapshot)
    const currentUser = await this.findUserFeatureSnapshot(userId);
    let scored = filteredUsers.map((u) => ({
      ...u,
      similarityScore: 0,
      avatar: u.userImages?.[0]?.url || null,
    }));

    if (currentUser?.profileVector) {
      const currentVec = currentUser.profileVector;
      scored = filteredUsers.map((u) => {
        const vec = this.buildSimpleVector(u);
        const similarity = this.cosineSimilarity(currentVec, vec);
        return {
          ...u,
          similarityScore: similarity,
          avatar: u.userImages?.[0]?.url || null,
        };
      });
      scored.sort((a, b) => b.similarityScore - a.similarityScore);
    }

    // افزودن relation و محدود کردن خروجی
    return scored.slice(0, limit).map((u) => ({
      ...u,
      relation: relationsMap.get(u.id),
    }));
  }

  private async findUserFeatureSnapshot(userId: number): Promise<any> {
    // فرض می‌کنیم FeatureStoreService را در UsersService تزریق کرده‌اید
    return this.featureStore.getUserFeatures(userId).catch(() => null);
  }

  private buildSimpleVector(user: User): number[] {
    return [
      user.city ? 1 : 0,
      user.birth_year
        ? (new Date().getFullYear() - (parseInt(user.birth_year) + 621)) / 100
        : 0,
      Math.min((user.aboutme?.length || 0) / 500, 1),
      (user.hobbies_self?.length || 0) / 10,
      (user.values_self?.length || 0) / 5,
      user.isFaceVerified ? 1 : 0,
      (user.trustScore || 50) / 100,
      user.gender === 'male' ? 1 : 0,
      user.marital ? 1 : 0,
      user.education ? 1 : 0,
    ];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length) return 0;
    const dot = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return normA && normB ? dot / (normA * normB) : 0;
  }

  // users.service.ts
  async findFullProfile(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['userImages', 'devices'], // و هر relation دیگری که نیاز دارید
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    return user;
  }

  async exploreUsers(page: number = 0, limit: number = 10): Promise<User[]> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userImages', 'images')
      .where('user.isCompleted = true');

    // می‌توانی اینجا ترتیب هوشمند (مثلاً بر اساس امتیاز یا تصادفی) بگذاری
    query.orderBy('RAND()'); // موقتاً تصادفی

    return query
      .skip(page * limit)
      .take(limit)
      .getMany();
  }

  async suspendAccount(userId: number): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    user.status = 'suspended';
    await this.userEventService.log({
      userId,
      type: EventType.ACCOUNT_DEACTIVATE,
      metadata: { action: 'suspend' },
    });
    return this.userRepository.save(user);
  }

  async resignAccount(userId: number): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    user.status = 'resigned';
    await this.userEventService.log({
      userId,
      type: EventType.ACCOUNT_DELETE_REQUEST,
      metadata: { action: 'resign' },
    });
    return this.userRepository.save(user);
  }
}
