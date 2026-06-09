import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

export class RequestHelper {
  // دریافت IP کاربر
  static getClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      return (forwardedFor as string).split(',')[0].trim(); // گرفتن IP اول از لیست
    }
    return req.socket.remoteAddress || 'نامشخص';
  }

  // دریافت اطلاعات دستگاه کاربر
  static getUserAgent(req: Request): string {
    return req.headers['user-agent'] || 'نامشخص';
  }
  static requireDeviceId(req: Request): string {
    const deviceId = req.clientInfo.deviceId;
    if (!deviceId) {
      throw new BadRequestException('DEVICE_NOT_IDENTIFIED');
    }
    return deviceId;
  }
}
