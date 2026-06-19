import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicePhone } from './entities/device-phone.entity';
import { UserDevice } from 'src/user-device/entities/user-device.entity';

@Injectable()
export class DevicePhoneService {
  constructor(
    @InjectRepository(DevicePhone)
    private readonly repo: Repository<DevicePhone>,
  ) {}

  // 🔁 نسخهٔ upsert اتمیک (غیرمنسوخ)
  async logEvent(dto: {
    device: UserDevice;
    phone: string;
    event: DevicePhone['event'];
    verified?: boolean;
  }) {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(DevicePhone)
      .values({
        device: { id: dto.device.id } as any, // ستون FK: deviceId
        phone: dto.phone,
        event: dto.event,
        verified: dto.verified ?? false,
      })
      .orUpdate(
        ['event', 'verified'], // ستون‌هایی که در صورت تداخل بروز شوند
        ['deviceId', 'phone'], // ستون‌های تضاد (unique constraint)
      )
      .execute();
  }

  async countUniquePhones(deviceId: number) {
    return this.repo.count({
      where: { device: { id: deviceId } },
    });
  }

  async countUniqueDevices(phone: string) {
    return this.repo.count({
      where: { phone },
    });
  }
}
