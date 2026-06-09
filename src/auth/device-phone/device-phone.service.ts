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

  async logEvent(dto: {
    device: UserDevice;
    phone: string;
    event: DevicePhone['event'];
    verified?: boolean;
  }) {
    let record = await this.repo.findOne({
      where: {
        device: { id: dto.device.id },
        phone: dto.phone,
      },
      relations: ['device'],
    });

    if (record) {
      record.event = dto.event;
      record.verified = dto.verified ?? record.verified;
      return this.repo.save(record);
    }

    record = this.repo.create({
      device: dto.device,
      phone: dto.phone,
      event: dto.event,
      verified: dto.verified ?? false,
    });

    return this.repo.save(record);
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
