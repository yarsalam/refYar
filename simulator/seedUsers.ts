// // backend/simulator/final-seed.ts
// import mysql from 'mysql2/promise';
// import * as bcrypt from 'bcrypt';

// const DB = {
//   host: '127.0.0.1',
//   port: 3307,
//   user: 'root',
//   password: 'root123',
//   database: 'yarsalam',
// };
// const TOTAL = 50; // ۵۰ کاربر
// const PASS = '123456';

// function randVec(len: number, base: number, noise: number): number[] {
//   return Array.from(
//     { length: len },
//     () => +(base + (Math.random() - 0.5) * noise).toFixed(4),
//   );
// }

// async function main() {
//   const conn = await mysql.createConnection(DB);
//   const hash = await bcrypt.hash(PASS, 10);

//   // پاک‌سازی کامل
//   for (const t of [
//     'user_event_logs',
//     'interaction',
//     'user_phase',
//     'user_feature_snapshots',
//     'profile_visitors',
//     'user_boosts',
//     'user_vips',
//     'user_credits',
//     'user_phones',
//     'user',
//   ]) {
//     await conn.execute(`DELETE FROM ${t}`);
//   }

//   const cities = [
//     'تهران',
//     'مشهد',
//     'اصفهان',
//     'شیراز',
//     'تبریز',
//     'کرج',
//     'اهواز',
//     'قم',
//     'کرمانشاه',
//     'رشت',
//   ];
//   const hobbiesPool = [
//     ['کتاب‌خوانی', 'ورزش'],
//     ['موسیقی', 'فیلم'],
//     ['طبیعت‌گردی', 'عکاسی'],
//     ['آشپزی', 'یوگا'],
//     ['بازی', 'گردشگری'],
//   ];
//   const valuesPool = [
//     ['صداقت', 'مهربانی'],
//     ['وفاداری', 'احترام'],
//     ['خانواده', 'پیشرفت'],
//   ];

//   // ۱. کاربران
//   for (let id = 1; id <= TOTAL; id++) {
//     const phone = `0912${String(id).padStart(7, '0')}`;
//     const nickname = `user${id}`;
//     const gender = id % 2 === 0 ? 'male' : 'female';
//     const birth_year = (1375 + (id % 20)).toString();
//     const daysAgo = id <= 10 ? 30 : id <= 25 ? 15 : 7;
//     const city = cities[id % cities.length];
//     const hobbies = hobbiesPool[id % hobbiesPool.length];
//     const values = valuesPool[id % valuesPool.length];

//     await conn.execute(
//       `INSERT INTO user (id, nickname, phone, gender, isCompleted, birth_day, birth_month, birth_year, city, province, aboutme, hobbies_self, values_self, partner_about, hobbies_partner, values_partner, education, employment, height, weight, health, religion, marital, nationality, password, isVerified, phase, status, createdAt)
//              VALUES (?,?,?,?,1,'15','6',?,?,?,?,?,?,?,?,?,'bachelor','employee','175','70','سالم','اسلام','single','ایرانی',?,1,'cold','active', DATE_SUB(NOW(), INTERVAL ? DAY))`,
//       [
//         id,
//         nickname,
//         phone,
//         gender,
//         birth_year,
//         city,
//         city,
//         `سلام! من ${nickname} هستم`,
//         JSON.stringify(hobbies),
//         JSON.stringify(values),
//         'مهربان',
//         JSON.stringify(hobbies),
//         JSON.stringify(values),
//         hash,
//         daysAgo,
//       ],
//     );
//     await conn.execute(
//       `INSERT INTO user_phones (userId, phone, isVerified, isActive) VALUES (?,?,1,1)`,
//       [id, phone],
//     );
//   }

//   // ۲. تعاملات
//   const types = ['view', 'like', 'superlike', 'message'];
//   for (let from = 1; from <= TOTAL; from++) {
//     for (let i = 0; i < 30; i++) {
//       let to = from;
//       while (to === from) to = Math.floor(Math.random() * TOTAL) + 1;
//       await conn.execute(
//         `INSERT INTO interaction (senderId, receiverId, type, createdAt) VALUES (?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
//         [from, to, types[i % 4], Math.floor(Math.random() * 30)],
//       );
//     }
//   }

//   // ۳. خریدها
//   const products = ['boost_1', 'credits_20', 'vip_month', 'starter_bundle'];
//   const amounts = [19000, 89000, 169000, 99000];
//   for (let id = 1; id <= TOTAL; id++) {
//     const num = id <= 10 ? 5 : id <= 25 ? 3 : 1;
//     for (let p = 0; p < num; p++) {
//       const idx = Math.floor(Math.random() * products.length);
//       await conn.execute(
//         `INSERT INTO payments (userId, productCode, amount, currency, method, status, createdAt) VALUES (?,?,?,'IRT','card_to_card','paid', DATE_SUB(NOW(), INTERVAL ? DAY))`,
//         [id, products[idx], amounts[idx], Math.floor(Math.random() * 30)],
//       );
//     }
//   }

//   // ۴. فازها
//   for (let id = 1; id <= TOTAL; id++) {
//     const score =
//       id <= 10 ? 55 + id * 2 : id <= 25 ? 25 + (id % 10) : 8 + (id % 10);
//     const phase = score >= 40 ? 'hot' : score >= 15 ? 'warm' : 'cold';
//     await conn.execute(
//       `INSERT INTO user_phase (userId, phase, score, everPaid) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE phase=?, score=?`,
//       [id, phase, score, id <= 25 ? 1 : 0, phase, score],
//     );
//   }

//   // ۵. Boost/VIP/Credit
//   for (const uid of [1, 3, 6, 10, 15, 20, 25, 30]) {
//     await conn.execute(
//       `INSERT INTO user_boosts (userId, instantCount, strength, activeUntil) VALUES (?,1,2,DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
//       [uid],
//     );
//   }
//   for (const uid of [2, 8, 18, 22, 28]) {
//     await conn.execute(
//       `INSERT INTO user_vips (userId, active, expiresAt) VALUES (?,1,DATE_ADD(NOW(), INTERVAL 30 DAY))`,
//       [uid],
//     );
//   }
//   for (const uid of [4, 9, 14, 19, 24, 29]) {
//     await conn.execute(
//       `INSERT INTO user_credits (userId, balance) VALUES (?,500)`,
//       [uid],
//     );
//   }

//   // ۶. بازدیدها
//   for (let vid = 1; vid <= TOTAL; vid++) {
//     for (let pid = 1; pid <= TOTAL; pid++) {
//       if (vid === pid) continue;
//       await conn.execute(
//         `INSERT INTO profile_visitors (visitorId, profileId, visitedAt) VALUES (?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
//         [vid, pid, Math.floor(Math.random() * 30)],
//       );
//     }
//   }

//   // ۷. اسنپ‌شات‌ها هماهنگ با فاز واقعی (مطابق user_phase)
//   console.log('📊 ساخت اسنپ‌شات‌های هماهنگ با phase...');

//   for (let id = 1; id <= TOTAL; id++) {
//     // محاسبه فاز مشابه بخش ۴ (برای هماهنگی)
//     let phase;
//     if (id <= 10) phase = 'hot';
//     else if (id <= 25) phase = 'warm';
//     else phase = 'cold';

//     const pVec = JSON.stringify(randVec(10, 0.5, 1.0));
//     const bVec = JSON.stringify(randVec(5, 0.3, 1.0));
//     const persVec = JSON.stringify(randVec(5, 0.5, 0.9));
//     const ltv = 150 + Math.floor(Math.random() * 451); // 150 تا 600
//     const purchaseProb = +(Math.random() * 0.6 + 0.2).toFixed(2); // 0.2 تا 0.8
//     const responseProb = +(Math.random() * 0.5 + 0.4).toFixed(2); // 0.4 تا 0.9
//     const matchProb = +(Math.random() * 0.4 + 0.3).toFixed(2); // 0.3 تا 0.7

//     await conn.execute(
//       `REPLACE INTO user_feature_snapshots (
//      userId, profileVector, behaviorVector, personalityVector, geoVector,
//      phase, boostStrength, avgLTV, purchaseProbability, responseProbability, matchProbability
//    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
//       [
//         id,
//         pVec,
//         bVec,
//         persVec,
//         JSON.stringify([0, 0]),
//         phase,
//         0,
//         ltv, // ← غیرصفر (150 تا 600)
//         purchaseProb, // ← 0.2 تا 0.8
//         responseProb, // ← 0.4 تا 0.9
//         matchProb, // ← 0.3 تا 0.7
//       ],
//     );
//   }

//   // همگام‌سازی فاز در جدول user (اختیاری، ولی خوب است)
//   await conn.execute(`
//   UPDATE user u
//   JOIN user_phase up ON u.id = up.userId
//   SET u.phase = up.phase
// `);

//   await conn.end();
//   console.log('✅ سیمولاتور پایان یافت. بک‌اند را ریستارت کن.');
// }

// main().catch(console.error);
import mysql from 'mysql2/promise';
import * as bcrypt from 'bcrypt';
import axios from 'axios'; // حتماً نصب باشه: npm i axios

const DB = {
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'root123',
  database: 'yarsalam',
};
const TOTAL = 50;
const PASS = '123456';

function randVec(len: number, base: number, noise: number): number[] {
  return Array.from(
    { length: len },
    () => +(base + (Math.random() - 0.5) * noise).toFixed(4),
  );
}

async function main() {
  const conn = await mysql.createConnection(DB);
  const hash = await bcrypt.hash(PASS, 10);

  // پاکسازی
  for (const t of [
    'user_event_logs',
    'interaction',
    'user_phase',
    'user_feature_snapshots',
    'profile_visitors',
    'user_boosts',
    'user_vips',
    'user_credits',
    'user_phones',
    'user',
  ]) {
    await conn.execute(`DELETE FROM ${t}`);
  }

  const cities = ['تهران','مشهد','اصفهان','شیراز','تبریز','کرج','اهواز','قم','کرمانشاه','رشت'];
  const hobbiesPool = [['کتاب‌خوانی','ورزش'],['موسیقی','فیلم'],['طبیعت‌گردی','عکاسی'],['آشپزی','یوگا'],['بازی','گردشگری']];
  const valuesPool = [['صداقت','مهربانی'],['وفاداری','احترام'],['خانواده','پیشرفت']];

  // ۱. کاربران
  for (let id = 1; id <= TOTAL; id++) {
    const phone = `0912${String(id).padStart(7,'0')}`;
    const nickname = `user${id}`;
    const gender = id % 2 === 0 ? 'male' : 'female';
    const birth_year = (1375 + (id % 20)).toString();
    const daysAgo = id <= 10 ? 30 : id <= 25 ? 15 : 7;
    const city = cities[id % cities.length];
    const hobbies = hobbiesPool[id % hobbiesPool.length];
    const values = valuesPool[id % valuesPool.length];

    await conn.execute(
      `INSERT INTO user (id, nickname, phone, gender, isCompleted, birth_day, birth_month, birth_year, city, province, aboutme, hobbies_self, values_self, partner_about, hobbies_partner, values_partner, education, employment, height, weight, health, religion, marital, nationality, password, isVerified, phase, status, createdAt)
       VALUES (?,?,?,?,1,'15','6',?,?,?,?,?,?,?,?,?,'bachelor','employee','175','70','سالم','اسلام','single','ایرانی',?,1,'cold','active', DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [id, nickname, phone, gender, birth_year, city, city, `سلام! من ${nickname} هستم`, JSON.stringify(hobbies), JSON.stringify(values), 'مهربان', JSON.stringify(hobbies), JSON.stringify(values), hash, daysAgo],
    );
    await conn.execute(`INSERT INTO user_phones (userId, phone, isVerified, isActive) VALUES (?,?,1,1)`, [id, phone]);
  }

  // ۲. تعاملات
  const types = ['view','like','superlike','message'];
  for (let from = 1; from <= TOTAL; from++) {
    for (let i = 0; i < 30; i++) {
      let to = from;
      while (to === from) to = Math.floor(Math.random() * TOTAL) + 1;
      await conn.execute(
        `INSERT INTO interaction (senderId, receiverId, type, createdAt) VALUES (?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [from, to, types[i % 4], Math.floor(Math.random() * 30)],
      );
    }
  }

  // ۳. خریدها (فقط رکورد پرداخت، بدون اعطای مستقیم)
  const products = ['boost_1', 'credits_20', 'vip_month', 'starter_bundle'];
  const amounts = [19000, 89000, 169000, 99000];
  const purchases: { userId: number; productCode: string }[] = [];

  for (let id = 1; id <= TOTAL; id++) {
    const num = id <= 10 ? 5 : id <= 25 ? 3 : 1;
    for (let p = 0; p < num; p++) {
      const idx = Math.floor(Math.random() * products.length);
      const productCode = products[idx];
      await conn.execute(
        `INSERT INTO payments (userId, productCode, amount, currency, method, status, createdAt)
         VALUES (?,?,?,'IRT','card_to_card','paid', DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [id, productCode, amounts[idx], Math.floor(Math.random() * 30)],
      );
      purchases.push({ userId: id, productCode });
    }
  }

  // ۴. فازها
  for (let id = 1; id <= TOTAL; id++) {
    const score = id <= 10 ? 55 + id * 2 : id <= 25 ? 25 + (id % 10) : 8 + (id % 10);
    const phase = score >= 40 ? 'hot' : score >= 15 ? 'warm' : 'cold';
    await conn.execute(
      `INSERT INTO user_phase (userId, phase, score, everPaid) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE phase=?, score=?`,
      [id, phase, score, id <= 25 ? 1 : 0, phase, score],
    );
  }

  // ۵. Boost/VIP/Credit --- حذف شدند!

  // ۶. بازدیدها
  for (let vid = 1; vid <= TOTAL; vid++) {
    for (let pid = 1; pid <= TOTAL; pid++) {
      if (vid === pid) continue;
      await conn.execute(
        `INSERT INTO profile_visitors (visitorId, profileId, visitedAt) VALUES (?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [vid, pid, Math.floor(Math.random() * 30)],
      );
    }
  }

  // ۷. اسنپ‌شات‌ها
  for (let id = 1; id <= TOTAL; id++) {
    let phase;
    if (id <= 10) phase = 'hot';
    else if (id <= 25) phase = 'warm';
    else phase = 'cold';

    const pVec = JSON.stringify(randVec(10, 0.5, 1.0));
    const bVec = JSON.stringify(randVec(5, 0.3, 1.0));
    const persVec = JSON.stringify(randVec(5, 0.5, 0.9));
    const ltv = 150 + Math.floor(Math.random() * 451);
    const purchaseProb = +(Math.random() * 0.6 + 0.2).toFixed(2);
    const responseProb = +(Math.random() * 0.5 + 0.4).toFixed(2);
    const matchProb = +(Math.random() * 0.4 + 0.3).toFixed(2);

    await conn.execute(
      `REPLACE INTO user_feature_snapshots (
        userId, profileVector, behaviorVector, personalityVector, geoVector,
        phase, boostStrength, avgLTV, purchaseProbability, responseProbability, matchProbability
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, pVec, bVec, persVec, JSON.stringify([0,0]), phase, 0, ltv, purchaseProb, responseProb, matchProb],
    );
  }

  await conn.execute(`
    UPDATE user u
    JOIN user_phase up ON u.id = up.userId
    SET u.phase = up.phase
  `);

  await conn.end();
  console.log('✅ MySQL seed done. Now calling grantBundle API...');

  // فراخوانی API برای هر پرداخت
  for (const p of purchases) {
    try {
      await axios.post(`http://localhost:3000/payments/grant-bundle/${p.userId}/${p.productCode}`);
      console.log(`✅ Granted ${p.productCode} to user ${p.userId}`);
    } catch (err: any) {
      console.error(`❌ Failed for user ${p.userId} ${p.productCode}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 50)); // کمی تأخیر
  }

  console.log('🎉 All done. Check Redis and DB.');
}

main().catch(console.error);