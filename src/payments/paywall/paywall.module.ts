import { forwardRef, Module } from '@nestjs/common';
import { PaywallService } from './paywall.service';
import { PhaseModule } from '../../phase/phase.module';
import { DevicePhoneModule } from 'src/auth/device-phone/device-phone.module';
import { VipModule } from '../vip/vip.module';

@Module({
  imports: [forwardRef(() => PhaseModule), DevicePhoneModule, VipModule],
  providers: [PaywallService],
  exports: [PaywallService],
})
export class PaywallModule {}
