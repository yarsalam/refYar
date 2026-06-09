// backend/simulator/ultimate-seed.ts
import axios from 'axios';
import mysql from 'mysql2/promise';
import Redis from 'ioredis';

const API = 'http://backend:5001';
const TOTAL_USERS = 30;
const PASSWORD = '123456';

const DB_CONFIG = {
  host: 'mysql', // از داخل Docker مستقیم به اسم سرویس
  port: 3306,
  user: 'root',
  password: 'root123',
  database: 'yarsalam',
};

const cities = ['تهران', 'مشهد', 'اصفهان', 'شیراز', 'تبریز', 'کرج', 'اهواز', 'قم', 'کرمانشاه', 'رشت'];
const hobbiesList = ['کتاب‌خوانی', 'ورزش', 'سفر', 'موسیقی', 'فیلم', 'طبیعت‌گردی', 'عکاسی', 'آشپزی', 'یوگا', 'بازی'];
const valuesList = ['صداقت', 'مهربانی', 'وفاداری', 'احترام', 'خانواده', 'پیشرفت', 'شادی'];

function randomPhone(id: number): string {
  if (id <= 5) return `0912000000${id}`;
  return `0912${id.toString().padStart(7, '0')}`;
}

async function seed() {
  const conn = await mysql.createConnection(DB_CONFIG);
  const redis = new Redis({ host: 'redis', port: 6379 });

  console.log('✅ اتصال به MySQL و Redis برقرار شد');

  // ۱. فعال‌سازی تمام کاربران موجود
  await conn.execute(`UPDATE user SET status = 'active'`);
  console.log('📊 تمام کاربران active شدند');

  // ۲. ساخت کاربران جدید و تکمیل پروفایل
  const tokens: Map<number, string> = new Map();

  for (let id = 1; id <= TOTAL_USERS; id++) {
    const phone = randomPhone(id);
    try {
      // لاگین یا ثبت‌نام سریع
      let token: string | undefined;
      try {
        const loginRes = await axios.post(`${API}/auth/login`, {
          phone, password: PASSWORD, platform: 'mobile',
        });
        token = loginRes.data.token;
      } catch (loginError: any) {
        // اگر کاربر وجود ندارد، بسازیم
        if (loginError.response?.status === 404 || loginError.response?.data?.code === 'NOT_EXISTING_USER') {
          // ثبت‌نام اولیه
          await axios.post(`${API}/auth/register/step1`, {
            phone, platform: 'mobile', gender: id % 2 === 0 ? 'male' : 'female',
          });
          // تأیید
          await axios.post(`${API}/auth/register/complete-verification`, { phone });
          // دوباره لاگین
          const loginRes = await axios.post(`${API}/auth/login`, {
            phone, password: PASSWORD, platform: 'mobile',
          });
          token = loginRes.data.token;
        }
      }
      if (!token) continue;

      tokens.set(id, token);

      // تکمیل پروفایل
      const city = cities[id % cities.length];
      const hobby = hobbiesList.slice(0, 3 + (id % 4));
      const value = valuesList.slice(0, 2 + (id % 3));
      await axios.patch(`${API}/users/${id}`, {
        city, province: city,
        birth_day: '15', birth_month: '6', birth_year: (1375 + (id % 20)).toString(),
        aboutme: `سلام! من ${hobby[0]} و ${hobby[1]} رو دوست دارم.`,
        hobbies_self: hobby,
        values_self: value,
        isCompleted: true,
        education: 'bachelor', employment: 'employee',
        height: '175', weight: '70', health: 'سالم',
        religion: 'اسلام', marital: 'single', nationality: 'ایرانی',
        partner_about: 'به دنبال کسی هستم که صادق و با محبت باشد.',
        hobbies_partner: ['موسیقی', 'طبیعت‌گردی'],
        values_partner: ['وفاداری', 'احترام'],
      }, { headers: { Authorization: `Bearer ${token}` } });
      console.log(`✅ کاربر ${id} تکمیل شد`);
    } catch (e: any) {
      console.log(`⚠️ کاربر ${id}: ${e.response?.data?.message || e.message}`);
    }
  }

  // ۳. ساختن Feature Snapshot برای همهٔ کاربران (۱ تا TOTAL_USERS)
  for (const id of Array.from(tokens.keys())) {
    const pv = JSON.stringify([0.5, 0.6, 0.7, 0.8, 0.4, 0.9, 0.3, 0.6, 0.5, 0.7]);
    const bv = JSON.stringify([0.3, 0.4, 0.2, 0.5, 0.1]);
    const per = JSON.stringify([0.6, 0.5, 0.7, 0.6, 0.4]);
    const gv = JSON.stringify([0, 0]);
    await conn.execute(
      `INSERT INTO user_feature_snapshots (userId, profileVector, behaviorVector, personalityVector, geoVector, phase) VALUES (?, ?, ?, ?, ?, 'cold') ON DUPLICATE KEY UPDATE profileVector=VALUES(profileVector)`,
      [id, pv, bv, per, gv]
    );
  }
  console.log('📊 Snapshotها ذخیره شدند');

  //  تصادفی بین همهٔ کاربران
  const types = ['view', 'like', 'superlike', 'message'];
  const interactionTasks: Promise<any>[] = [];
  for (const [fromId, token] of tokens) {
    for (let i = 0; i < 5; i++) {
      let toId = fromId;
      while (toId === fromId) toId = Math.floor(Math.random() * TOTAL_USERS) + 1;
      const type = types[Math.floor(Math.random() * types.length)];
      interactionTasks.push(
        axios.post(`${API}/interactions/${toId}/${type}`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {})
      );
    }
  }
  await Promise.all(interactionTasks);
  console.log(`✅ ${interactionTasks.length} تعامل ثبت شد`);

  // ۵. ساخت Boost، VIP و Credit
  // Boost: کاربران ۱, ۶, ۱۱
  for (const uid of [1, 6, 11]) {
    if (tokens.has(uid)) {
      try {
        await axios.post(`${API}/boost/grant-free/${uid}`, {}, {
          headers: { Authorization: `Bearer ${tokens.get(uid)}` },
        });
      } catch {}
    }
  }
  // VIP: کاربران ۲, ۷
  const now = Date.now();
  const expiresAt = now + 30 * 86400000;
  for (const uid of [2, 7]) {
    await redis.zadd('vip:queue', now.toString(), uid.toString());
    await redis.hset(`vip:meta:${uid}`, 'expiresAt', expiresAt.toString(), 'createdAt', now.toString());
    await conn.execute(
      `INSERT INTO user_vips (userId, active, expiresAt) VALUES (?, 1, FROM_UNIXTIME(?/1000)) ON DUPLICATE KEY UPDATE active=1`,
      [uid, expiresAt]
    );
  }
  // Credit بالا: کاربر ۳
  await redis.zadd('credit:queue', '100', '3');

  console.log('⚡ Boost, VIP و Credit تزریق شدند');

  // ۶. Profile Visitors برای کاربر ۱
  const visitorIds = Array.from(tokens.keys()).filter(id => id !== 1).slice(0, 10);
  for (const vid of visitorIds) {
    if (tokens.has(vid)) {
      try {
        await axios.post(`${API}/profile-visitors`, {
          visitorId: vid,
          profileId: 1,
        }, { headers: { Authorization: `Bearer ${tokens.get(vid)}` } }).catch(() => {});
      } catch {}
    }
  }
  console.log(`👀 ${visitorIds.length} بازدید برای کاربر ۱ ثبت شد`);

  // ۷. محاسبه فاز
  for (const [id, token] of tokens) {
    try {
      await axios.get(`${API}/phase/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {}
  }
  console.log('📈 فازها محاسبه شدند');

  await conn.end();
  redis.disconnect();

  console.log('🎉 سیمولاتور نهایی با موفقیت به پایان رسید.');
  console.log('حالا بک‌اند را ری‌استارت کن و فرانت را کامل ببند و باز کن.');
}

seed().catch(console.error);