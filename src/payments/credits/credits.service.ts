// import { Injectable } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { UserCredits } from './entities/user-credits.entity';
// import { UserEventService } from 'src/user-event/user-event.service';
// import { EventType } from 'src/user-event/entities/user-event.entity';
// import { PaywallException } from '../paywall/paywall.exception';
// import { BoostQueueService } from 'src/redis/boost-queue.service';

// @Injectable()
// export class CreditsService {
//   constructor(
//     @InjectRepository(UserCredits)
//     private readonly repo: Repository<UserCredits>,
//     private readonly userEventService: UserEventService,
//     private readonly boostQueueService: BoostQueueService,
//   ) {}

//   async get(userId: number) {
//     let credits = await this.repo.findOne({ where: { userId } });
//     if (!credits) {
//       credits = this.repo.create({ userId, balance: 0 });
//       await this.repo.save(credits);
//     }
//     return credits;
//   }

//   async consume(userId: number, amount: number, reason: string) {
//     const credits = await this.get(userId);

//     if (credits.balance < amount) {
//       throw new PaywallException({
//         type: 'credits',
//         reason,
//         required: amount,
//         balance: credits.balance,
//       });
//     }

//     // رفع race condition: استفاده از decrement اتمیک
//     await this.repo.decrement({ userId }, 'balance', amount);

//     await this.userEventService.log({
//       userId,
//       type: EventType.CREDITS_SPENT,
//       metadata: { amount, reason },
//     });

//     return this.get(userId);
//   }

//   async grant(userId: number, amount: number) {
//     // اطمینان از وجود رکورد
//     await this.get(userId);

//     // رفع race condition: استفاده از increment اتمیک
//     await this.repo.increment({ userId }, 'balance', amount);

//     const saved = await this.get(userId);

//     await this.userEventService.log({
//       userId,
//       type: EventType.CREDITS_GRANTED,
//       metadata: { amount, source: 'grant' },
//     });

//     if (saved.balance >= 100) {
//       await this.boostQueueService.enqueueHighCredit(userId, saved.balance);
//     }

//     return saved;
//   }
// }
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserCredits } from './entities/user-credits.entity';
import { UserEventService } from 'src/user-event/user-event.service';
import { EventType } from 'src/user-event/entities/user-event.entity';
import { PaywallException } from '../paywall/paywall.exception';
import { BoostQueueService } from 'src/redis/boost-queue.service';

@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(UserCredits)
    private readonly repo: Repository<UserCredits>,
    private readonly userEventService: UserEventService,
    private readonly boostQueueService: BoostQueueService,
  ) {}

  async get(userId: number) {
    let credits = await this.repo.findOne({ where: { userId } });
    if (!credits) {
      credits = this.repo.create({ userId, balance: 0 });
      await this.repo.save(credits);
    }
    return credits;
  }

  /** بهتر است از upsert استفاده کنیم تا race condition کمتر شود */
  async ensureExists(userId: number): Promise<UserCredits> {
    const result = await this.repo.upsert(
      { userId, balance: 0 },
      ['userId'], // conflict on userId
    );
    return this.get(userId); // تازه‌ترین مقدار
  }

  async consume(userId: number, amount: number, reason: string) {
    await this.ensureExists(userId); // اطمینان از وجود رکورد

    const current = await this.get(userId);
    if (current.balance < amount) {
      throw new PaywallException({
        type: 'credits',
        reason,
        required: amount,
        balance: current.balance,
      });
    }

    await this.repo.decrement({ userId }, 'balance', amount);

    await this.userEventService.log({
      userId,
      type: EventType.CREDITS_SPENT,
      metadata: { amount, reason },
    });

    return this.get(userId);
  }

  async grant(userId: number, amount: number) {
    await this.ensureExists(userId);

    await this.repo.increment({ userId }, 'balance', amount);

    const saved = await this.get(userId);

    await this.userEventService.log({
      userId,
      type: EventType.CREDITS_GRANTED,
      metadata: { amount, source: 'grant' },
    });

    if (saved.balance >= 100) {
      await this.boostQueueService.enqueueHighCredit(userId, saved.balance);
    }

    return saved;
  }
}
