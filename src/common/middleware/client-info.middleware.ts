import { Injectable, NestMiddleware } from '@nestjs/common';
import axios from 'axios';
import { ClientInfo } from 'src/types/client-info.type';

@Injectable()
export class ClientInfoMiddleware implements NestMiddleware {
  async use(req: any, res: any, next: () => void) {
    // const ip =
    //   req.headers['x-real-ip'] ||
    //   req.headers['x-forwarded-for']?.split(',')[0] ||
    //   req.ip ||
    //   req.connection?.remoteAddress;
    // const rawDeviceId = req.headers['x-device-id'];

    // مقداردهی اولیه بدون null
    // const clientInfo: ClientInfo = {
    //   ip,
    //   platform: req.headers['x-platform'] ?? undefined,
    //   brand: req.headers['x-brand'] ?? undefined,
    //   model: req.headers['x-model'] ?? undefined,
    //   deviceId:
    //     typeof rawDeviceId === 'string' && rawDeviceId.length > 5
    //       ? rawDeviceId
    //       : undefined,
    //   appVersion: req.headers['x-app-version'] ?? undefined,
    //   osVersion: req.headers['x-os-version'] ?? undefined,
    //   isVpn: false,
    // };

    // try {
    //   // --- GeoIP ---
    //   const geo = await axios.get(`https://ipapi.co/${ip}/json/`);

    //   clientInfo.country = geo.data.country_name ?? undefined;
    //   clientInfo.city = geo.data.city ?? undefined;

    //   // VPN detection
    //   const asn = geo.data.org?.toLowerCase();
    //   if (
    //     asn?.includes('vpn') ||
    //     asn?.includes('hosting') ||
    //     asn?.includes('cloud')
    //   ) {
    //     clientInfo.isVpn = true;
    //   }

    //   // --- Second dataset ---
    //   const vpnCheck = await axios.get(`https://ipwhois.app/json/${ip}`);
    //   if (vpnCheck.data.proxy === true || vpnCheck.data.is_proxy === 'yes') {
    //     clientInfo.isVpn = true;
    //   }
    // } catch (e: unknown) {
    //   console.log(`⚠️ [ClientInfo] GeoIP/VPN lookup failed: ${e.message}`);
    // }

    // attach
    // req.clientInfo = clientInfo;

    next();
  }
}
