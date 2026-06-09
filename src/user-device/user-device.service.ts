import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { CreateUserDeviceDto } from './dto/create-user-device.dto';
import { UserDevice } from './entities/user-device.entity';
import { User } from 'src/users/entities/user.entity';
import * as geoip from 'geoip-lite';

type GeoLookupResult = {
  range: [number, number];
  country: string;
  region: string;
  city: string;
  ll: [number, number];
  timezone?: string;
} | null;

function safeGeoLookup(ip: string): GeoLookupResult {
  const result = geoip.lookup(ip);

  if (
    result &&
    typeof result === 'object' &&
    'country' in result &&
    'city' in result
  ) {
    return result as GeoLookupResult;
  }

  return null;
}

@Injectable()
export class UserDeviceService {
  constructor(
    @InjectRepository(UserDevice)
    private readonly userDeviceRepo: Repository<UserDevice>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createOrUpdateToken(dto: CreateUserDeviceDto): Promise<UserDevice> {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new Error('User not found');
    const deviceData = {
      user,
      ipAddress: dto.ipAddress,
      platform: dto.platform,
      model: dto.model ?? 'unknown',
      brand: dto.brand ?? 'unknown',
      deviceId: dto.deviceId,
      osVersion: dto.osVersion,
      appVersion: dto.appVersion,
      country: dto.country,
      city: dto.city,
      isVPN: dto.isVpn,
      isOnline: true,
    };

    const existing = await this.userDeviceRepo.findOne({
      where: { user: { id: user.id }, deviceId: dto.deviceId },
    });

    if (existing) {
      Object.assign(existing, deviceData);
      return await this.userDeviceRepo.save(existing);
    }

    const newDevice = this.userDeviceRepo.create(deviceData);
    return await this.userDeviceRepo.save(newDevice);
  }

  async countRequestsByIp(ip: string, sinceMinutes = 30): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    return this.userDeviceRepo.count({
      where: { ipAddress: ip, createdAt: MoreThan(since) },
    });
  }

  async setOnlineStatus(userId: number, isOnline: boolean) {
    await this.userDeviceRepo
      .createQueryBuilder()
      .update(UserDevice)
      .set({ isOnline })
      .where('userId = :userId', { userId })
      .execute();
  }

  async findByClientDeviceId(deviceId: string): Promise<UserDevice | null> {
    return this.userDeviceRepo.findOne({
      where: { deviceId },
    });
  }
}
