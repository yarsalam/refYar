import mysql from 'mysql2/promise';
import * as bcrypt from 'bcrypt';
import axios from 'axios'; // حتما نصب شود

const DB = {
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'root123',
  database: 'yarsalam',
};
const TOTAL = 25;
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

  // پاکسازی جداول
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

  // ✅ ۱. درج باندل‌های محصول (برای اینکه grantBundle خطا نده)
  const bundles = [
    { code: 'boost_1', price: 19000, items: [{ type: 'boost', amount: 1 }] },
    {
      code: 'credits_20',
      price: 89000,
      items: [{ type: 'credits', amount: 120 }],
    },
    { code: 'vip_month', price: 169000, items: [{ type: 'vip', amount: 30 }] },
    {
      code: 'starter_bundle',
      price: 99000,
      items: [
        { type: 'boost', amount: 1 },
        { type: 'credits', amount: 120 },
      ],
    },
  ];

  for (const b of bundles) {
    await conn.execute(
      `INSERT INTO product_bundles (code, items, price, active) VALUES (?, ?, ?, 1)`,
      [b.code, JSON.stringify(b.items), b.price],
    );
  }

  const cities = [
    'تهران',
    'مشهد',
    'اصفهان',
    'شیراز',
    'تبریز',
    'کرج',
    'اهواز',
    'قم',
    'کرمانشاه',
    'رشت',
  ];
  const hobbiesPool = [
    ['کتاب‌خوانی', 'ورزش'],
    ['موسیقی', 'فیلم'],
    ['طبیعت‌گردی', 'عکاسی'],
    ['آشپزی', 'یوگا'],
    ['بازی', 'گردشگری'],
  ];
  const valuesPool = [
    ['صداقت', 'مهربانی'],
    ['وفاداری', 'احترام'],
    ['خانواده', 'پیشرفت'],
  ];

  // ۲. ساخت کاربران
  for (let id = 1; id <= TOTAL; id++) {
    const phone = `0912${String(id).padStart(7, '0')}`;
    const nickname = `user${id}`;
    const gender = id % 2 === 0 ? 'male' : 'female';
    const birth_year = (1375 + (id % 20)).toString();
    const daysAgo = id <= 5 ? 30 : id <= 12 ? 15 : 7;
    const city = cities[id % cities.length];
    const hobbies = JSON.stringify(hobbiesPool[id % hobbiesPool.length]);
    const values = JSON.stringify(valuesPool[id % valuesPool.length]);

    await conn.execute(
      `INSERT INTO user (id, nickname, phone, gender, isCompleted, birth_day, birth_month, birth_year, city, province, aboutme, hobbies_self, values_self, partner_about, hobbies_partner, values_partner, education, employment, height, weight, health, religion, marital, nationality, password, isVerified, phase, status, createdAt)
       VALUES (?,?,?,?,1,'15','6',?,?,?,?,?,?,?,?,?,'bachelor','employee','175','70','سالم','اسلام','single','ایرانی',?,1,'cold','active', DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [
        id,
        nickname,
        phone,
        gender,
        birth_year,
        city,
        city,
        `سلام! من ${nickname} هستم`,
        hobbies,
        values,
        'مهربان',
        hobbies,
        values,
        hash,
        daysAgo,
      ],
    );
    await conn.execute(
      `INSERT INTO user_phones (userId, phone, isVerified, isActive) VALUES (?,?,1,1)`,
      [id, phone],
    );
  }

  // ۳. تعاملات
  const types = ['view', 'like', 'superlike', 'pass'];
  for (let from = 1; from <= TOTAL; from++) {
    for (let i = 0; i < 15; i++) {
      let to = from;
      while (to === from) to = Math.floor(Math.random() * TOTAL) + 1;
      const type = types[Math.floor(Math.random() * types.length)];
      await conn.execute(
        `INSERT INTO interaction (senderId, receiverId, type, createdAt) VALUES (?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [from, to, type, Math.floor(Math.random() * 30)],
      );
    }
  }

  // بلاک و ریپورت
  for (let from = 1; from <= TOTAL; from++) {
    if (Math.random() < 0.2) {
      let to = from;
      while (to === from) to = Math.floor(Math.random() * TOTAL) + 1;
      await conn.execute(
        `INSERT INTO block (userId, targetUserId) VALUES (?,?)`,
        [from, to],
      );
    }
    if (Math.random() < 0.1) {
      let to = from;
      while (to === from) to = Math.floor(Math.random() * TOTAL) + 1;
      await conn.execute(
        `INSERT INTO reports (reporterId, reportedUserId, reason) VALUES (?,?, 'spam')`,
        [from, to],
      );
    }
  }

  // ۴. خریدها – همزمان آرایه‌ای برای فراخوانی API پر می‌کنیم
  const products = ['boost_1', 'credits_20', 'vip_month', 'starter_bundle'];
  const amounts = [19000, 89000, 169000, 99000];

  const purchases: { userId: number; productCode: string }[] = []; // <--- ذخیره خریدها

  for (let id = 1; id <= TOTAL; id++) {
    const num = id <= 8 ? 4 : id <= 16 ? 2 : 0;
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

  // ۵. فازها
  for (let id = 1; id <= TOTAL; id++) {
    let score, phase;
    if (id <= 6) {
      score = 55 + id * 2;
      phase = 'hot';
    } else if (id <= 14) {
      score = 25 + (id % 8);
      phase = 'warm';
    } else {
      score = 5 + (id % 10);
      phase = 'cold';
    }
    await conn.execute(
      `INSERT INTO user_phase (userId, phase, score, everPaid) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE phase=?, score=?`,
      [id, phase, score, id <= 16 ? 1 : 0, phase, score],
    );
  }

  // ۶. بازدیدها
  for (let pid = 1; pid <= TOTAL; pid++) {
    const visitors = new Set<number>();
    while (visitors.size < 5) {
      const vid = Math.floor(Math.random() * TOTAL) + 1;
      if (vid !== pid) visitors.add(vid);
    }
    for (const vid of visitors) {
      await conn.execute(
        `INSERT INTO profile_visitors (visitorId, profileId, visitedAt) VALUES (?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [vid, pid, Math.floor(Math.random() * 30)],
      );
    }
  }

  // ۷. اسنپ‌شات‌ها
  console.log('📊 ساخت اسنپ‌شات‌های هماهنگ با phase...');
  for (let id = 1; id <= TOTAL; id++) {
    const score =
      id <= 10 ? 55 + id * 2 : id <= 25 ? 25 + (id % 10) : 8 + (id % 10);
    const phase = score >= 40 ? 'hot' : score >= 15 ? 'warm' : 'cold';

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
      [
        id,
        pVec,
        bVec,
        persVec,
        JSON.stringify([0, 0]),
        phase,
        0,
        ltv,
        purchaseProb,
        responseProb,
        matchProb,
      ],
    );
  }

  await conn.execute(`
    UPDATE user u
    JOIN user_phase up ON u.id = up.userId
    SET u.phase = up.phase
    WHERE u.phase != up.phase OR u.phase IS NULL
  `);

  // backend/seed.ts (بخش‌های اضافه‌شده)
  // ... بعد از بخش ۷ (اسنپ‌شات‌ها) و قبل از بستن connection

  // ========== ۸. رویدادهای کاربران (برای Assistant و SEO) ==========
  // ========== ۸. رویدادهای کاربران (برای Assistant و SEO) ==========
  console.log('📊 درج رویدادهای کاربران...');

  // تمام مقادیر معتبر برای ستون ENUM type
  const numericEventStrings = Array.from({ length: 46 }, (_, i) => String(i));
  const explicitEventStrings = [
    'boost_used',
    'boost_expired',
    'promotion_shown',
    'promotion_clicked',
    'promotion_dismissed',
    'feed_shown',
    'cold_feed_shown',
    'payment_initiated',
    'user_registered',
  ];
  const validEventTypes = [...numericEventStrings, ...explicitEventStrings];

  for (let uid = 1; uid <= TOTAL; uid++) {
    const eventCount = 10 + Math.floor(Math.random() * 11);
    for (let e = 0; e < eventCount; e++) {
      const type =
        validEventTypes[Math.floor(Math.random() * validEventTypes.length)];
      const daysAgo = Math.floor(Math.random() * 30);
      const metadata: any = {};

      // (اختیاری) می‌توانید برای بعضی نوع‌ها متادیتای جذاب بسازید
      // برای سادگی، خالی می‌گذاریم ولی برای SEO می‌توانید موارد زیر را فعال کنید:
      // if (type === '9') metadata = { source: 'suggestion' }; // PROFILE_VIEW
      // if (type === '14') metadata = { length: 80 };           // MESSAGE_SENT

      await conn.execute(
        `INSERT INTO user_event_logs (userId, type, metadata, createdAt)
       VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [uid, type, JSON.stringify(metadata), daysAgo],
      );
    }
  }

  // ========== ۹. متریک‌های SEO ==========
  console.log('📈 درج متریک‌های SEO...');
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const types = ['technical', 'user', 'campaign', 'competitor'];
    const type = types[i % types.length];
    const score = 50 + Math.random() * 40;
    await conn.execute(
      `INSERT INTO seo_metrics (metricDate, type, data, score, ltv, cac, paybackPeriod, revenuePerUser, seoROI)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date.toISOString().split('T')[0],
        type,
        JSON.stringify({ sample: true }),
        score,
        150 + Math.random() * 300,
        50 + Math.random() * 100,
        3 + Math.random() * 9,
        200 + Math.random() * 400,
        score / 50,
      ],
    );
  }

  // ========== ۱۰. فعالیت‌های SEO ==========
  console.log('📢 درج فعالیت‌های SEO...');
  const platforms = [
    'instagram',
    'telegram',
    'linkedin',
    'medium',
    'google_ads',
  ];
  for (let i = 0; i < 15; i++) {
    const platform = platforms[i % platforms.length];
    const cost = 5000 + Math.floor(Math.random() * 50000);
    const revenue = cost * (0.5 + Math.random() * 2);
    await conn.execute(
      `INSERT INTO seo_activities (type, platform, url, content, cost, results, performedAt)
     VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [
        'social_post',
        platform,
        `https://${platform}.com/post/${i}`,
        `محتوای تستی شماره ${i}`,
        cost,
        JSON.stringify({
          clicks: Math.floor(Math.random() * 500),
          impressions: Math.floor(Math.random() * 5000),
          registrations: Math.floor(Math.random() * 20),
          conversions: Math.floor(Math.random() * 5),
          revenue: Math.round(revenue),
        }),
        Math.floor(Math.random() * 30),
      ],
    );
  }

  // ========== ۱۱. داده‌های رقبا ==========
  console.log('🕵️ درج داده‌های رقبا...');
  const competitors = [
    { name: 'همدم', domain: 'hamdam.com' },
    { name: 'همسان', domain: 'hamsan.com' },
  ];
  for (const comp of competitors) {
    await conn.execute(
      `INSERT INTO competitor_data (name, domain, date, traffic, backlinks, social)
     VALUES (?, ?, CURDATE(), ?, ?, ?)`,
      [
        comp.name,
        comp.domain,
        JSON.stringify({
          monthlyVisits: 5000 + Math.floor(Math.random() * 20000),
          trafficSources: { direct: 30, search: 40, social: 20, referral: 10 },
          topKeywords: [
            {
              keyword: 'همسریابی',
              position: 3 + Math.floor(Math.random() * 10),
              traffic: 1000,
            },
          ],
        }),
        JSON.stringify({
          total: 500 + Math.floor(Math.random() * 2000),
          referringDomains: 50 + Math.floor(Math.random() * 100),
          newLinks: 10,
          lostLinks: 2,
        }),
        JSON.stringify({
          instagram: {
            followers: 1000 + Math.floor(Math.random() * 10000),
            growth: 0.1,
          },
          telegram: {
            members: 500 + Math.floor(Math.random() * 5000),
            growth: 0.05,
          },
        }),
      ],
    );
  }

  // ========== ۱۲. بروزرسانی منبع جذب کاربران (برای انتساب درآمد) ==========
  console.log('🏷️ بروزرسانی منبع جذب کاربران...');
  const sources = ['organic', 'instagram', 'telegram', 'google', 'direct'];
  for (let uid = 1; uid <= TOTAL; uid++) {
    const source = sources[uid % sources.length];
    await conn.execute(
      `UPDATE user SET metadata = JSON_SET(COALESCE(metadata, '{}'), '$.acquisitionSource', ?) WHERE id = ?`,
      [source, uid],
    );
  }

  // ✅ حالا که همهٔ کارهای MySQL تمام شد، connection را ببند
  await conn.end();
  console.log('✅ MySQL Seed تمام شد. حالا grantBundle API صدا زده می‌شود...');

  // ========== ۱۳. فراخوانی API برای اعمال واقعی خریدها (و پر شدن Redis) ==========
  let successCount = 0;
  let failCount = 0;
  for (const p of purchases) {
    try {
      await axios.post(
        `http://localhost:5001/payments/grant-bundle/${p.userId}/${p.productCode}`,
      );
      console.log(`✅ granted ${p.productCode} to user ${p.userId}`);
      successCount++;
    } catch (err: any) {
      console.error(
        `❌ failed for user ${p.userId} ${p.productCode}: ${err.message}`,
      );
      failCount++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(
    `🎉 پایان فراخوانی‌ها. موفق: ${successCount}, ناموفق: ${failCount}`,
  );
  console.log('حالا Redis را با پورت 6380 بررسی کن:');
  console.log('  redis-cli -p 6380');
  console.log('  ZRANGE boost:v1:queue 0 -1 WITHSCORES');
  console.log('  ZRANGE vip:queue 0 -1 WITHSCORES');
  console.log('  ZRANGE credit:queue 0 -1 WITHSCORES');
}

main().catch(console.error);
