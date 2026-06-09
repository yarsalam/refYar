import { setTimeout } from 'timers/promises';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const TOTAL_BOTS = 5;
const SIM_DURATION_MIN = 3;
const TICK_EVERY_MS = 10000;
const ACTION_PROB = 0.45;
const NEST_API = 'http://127.0.0.1:5001';
const DEFAULT_PASSWORD = '123456';
const TEST_IMAGE_PATH = path.join(__dirname, 'test.jpg');

class RealBot {
  phone: string;
  password = DEFAULT_PASSWORD;
  token?: string;
  client!: any;
  userId: number;
  userData: any = {};
  suggestionIds: number[] = [];

  constructor(userId: number) {
    this.userId = userId;
    this.phone = `0912${userId.toString().padStart(7, '0')}`;
  }

  async login() {
    try {
      console.log(`[${this.userId}] تلاش برای لاگین با شماره: ${this.phone}`);

      const res = await axios.post(
        `${NEST_API}/auth/login`,
        {
          phone: this.phone,
          password: this.password,
          platform: 'web',
        },
        { timeout: 10000 },
      );

      this.token = res.data.token || res.data.access_token;
      if (!this.token) throw new Error('توکن دریافت نشد');

      this.client = axios.create({
        baseURL: NEST_API,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      console.log(
        `✅ [${this.userId}] لاگین موفق - توکن: ${this.token.substring(0, 30)}...`,
      );
      return true;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطای لاگین: ${errorMsg}`);

      // اگر خطای لاگین داشت، کاربر را دوباره بساز
      if (
        errorMsg.includes('کاربر یافت نشد') ||
        errorMsg.includes('Invalid credentials')
      ) {
        console.log(`🔄 [${this.userId}] تلاش برای ساخت کاربر جدید...`);
        await this.createUser();
        return await this.login();
      }
      return false;
    }
  }

  async createUser() {
    try {
      console.log(`[${this.userId}] ساخت کاربر جدید...`);

      // مرحله ۱: ثبت اولیه
      await axios.post(
        `${NEST_API}/auth/register/step1`,
        {
          phone: this.phone,
          platform: 'mobile',
          nickname: `user${this.userId}`,
          gender: this.userId % 2 === 0 ? 'male' : 'female',
        },
        { timeout: 15000 },
      );

      // مرحله ۲: complete-verification
      const deviceId = `test-device-${this.userId}-${Date.now()}`;
      const verifyRes = await axios.post(
        `${NEST_API}/auth/register/complete-verification`,
        { phone: this.phone },
        {
          timeout: 15000,
          headers: {
            'x-device-id': deviceId,
            'x-platform': 'mobile',
            'x-brand': 'TestBot',
            'x-model': 'Simulator',
          },
        },
      );

      const tempToken = verifyRes.data.token || verifyRes.data.access_token;
      if (!tempToken) throw new Error('توکن موقت دریافت نشد');

      // مرحله ۳: تکمیل پروفایل
      await axios.post(
        `${NEST_API}/auth/register/completeProfile`,
        {
          nickname: `user${this.userId}`,
          birthDate: {
            year: (1375 + (this.userId % 20)).toString(),
            month: '6',
            day: '15',
          },
          city: 'تهران',
          province: 'تهران',
          marital: 'single',
          education: 'bachelor',
          employment: 'employee',
          height: '175',
          weight: '70',
          health: 'سالم',
          nationality: 'ایرانی',
          religion: 'اسلام',
          values_self: ['صداقت', 'مهربانی'],
          hobbies_self: ['کتاب‌خوانی', 'ورزش', 'سفر'],
          values_partner: ['وفاداری', 'احترام'],
          hobbies_partner: ['موسیقی', 'فیلم', 'طبیعت‌گردی'],
          aboutme: 'سلام، من یک کاربر تست هستم!',
          partner_about: 'به دنبال کسی هستم که صادق و مهربان باشد.',
          password: this.password,
        },
        {
          timeout: 20000,
          headers: { Authorization: `Bearer ${tempToken}` },
        },
      );

      console.log(`✅ [${this.userId}] کاربر با موفقیت ساخته شد`);
      return true;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در ساخت کاربر: ${errorMsg}`);
      return false;
    }
  }

  async act() {
    if (!this.token) {
      const loggedIn = await this.login();
      if (!loggedIn) return;
    }

    const targetUserId = this.getRandomTarget();
    if (!targetUserId) return;

    const action = this.getRandomAction();

    try {
      console.log(
        `🎬 [${this.userId}] انجام اکشن: ${action} به کاربر ${targetUserId}`,
      );

      switch (action) {
        case 'message':
          const targetMsg = this.getRandomTarget();
          if (targetMsg) await this.sendMessage(targetMsg);
          break;
        case 'like':
          const targetLike = this.getRandomTarget();
          if (targetLike) await this.like(targetLike);
          break;
        case 'view':
          const targetView = this.getRandomTarget();
          if (targetView) await this.viewProfile(targetView);
          break;
        case 'superlike':
          const targetSuperlike = this.getRandomTarget();
          if (targetSuperlike) await this.superLike(targetSuperlike);
          break;
        case 'uploadImage':
          await this.uploadImage();
          break;
        case 'sendFeedback':
          await this.sendFeedback();
          break;
        case 'getPhase':
          await this.getPhase();
          break;
        case 'getMyProfile':
          await this.getMyProfile();
          break;
        case 'getUserProfile':
          const targetProfile = this.getRandomTarget();
          if (targetProfile) await this.getUserProfile(targetProfile);
          break;
        case 'getSuggestions':
          await this.getSuggestions();
          break;
        case 'acceptSuggestion':
          await this.acceptRandomSuggestion();
          break;
        case 'reportUser':
          const targetReport = this.getRandomTarget();
          if (targetReport) await this.reportUser(targetReport);
          break;
        case 'blockUser':
          const targetBlock = this.getRandomTarget();
          if (targetBlock) await this.blockUser(targetBlock);
          break;
        case 'getSentInteractions':
          await this.getSentInteractions();
          break;
        case 'getReceivedInteractions':
          await this.getReceivedInteractions();
          break;
        case 'changePassword':
          await this.changePassword();
          break;
        case 'skip':
          console.log(`⏭️  [${this.userId}] اسکیپ کرد`);
          break;
      }

      console.log(`✅ [${this.userId}] اکشن ${action} موفقیت‌آمیز بود`);
    } catch (e: any) {
      await this.handleError(e, action, targetUserId);
    }
  }

  private getRandomTarget(): number | null {
    const target = 1 + Math.floor(Math.random() * TOTAL_BOTS);
    return target === this.userId ? null : target;
  }

  private getRandomAction(): string {
    const actions = [
      { name: 'message', weight: 8 },
      { name: 'like', weight: 10 },
      { name: 'view', weight: 10 },
      { name: 'superlike', weight: 3 },
      { name: 'uploadImage', weight: 2 },
      { name: 'sendFeedback', weight: 3 },
      { name: 'getPhase', weight: 2 },
      { name: 'getMyProfile', weight: 4 },
      { name: 'getUserProfile', weight: 5 },
      { name: 'filterUsers', weight: 3 },
      { name: 'getSuggestions', weight: 6 },
      { name: 'acceptSuggestion', weight: 4 },
      { name: 'reportUser', weight: 1 },
      { name: 'blockUser', weight: 1 },
      { name: 'getSentInteractions', weight: 3 },
      { name: 'getReceivedInteractions', weight: 3 },
      { name: 'changePassword', weight: 1 },
      { name: 'skip', weight: 5 },
    ];

    const totalWeight = actions.reduce((sum, action) => sum + action.weight, 0);
    let random = Math.random() * totalWeight;

    for (const action of actions) {
      if (random < action.weight) {
        return action.name;
      }
      random -= action.weight;
    }

    return 'skip';
  }

  async sendMessage(to: number) {
    // ابتدا مطمئن شویم endpoint messages وجود دارد
    try {
      await this.client.post('/messages', {
        from_id: this.userId,
        to_id: to,
        content: 'سلام 👋 از طرف بات تست',
        is_free: true,
      });

      // سپس interaction را ثبت کنیم
      await this.recordInteraction(to, 'message');
    } catch (e: any) {
      // اگر endpoint messages وجود نداشت، فقط interaction ثبت شود
      if (e.response?.status === 404) {
        await this.recordInteraction(to, 'message');
      } else {
        throw e;
      }
    }
  }

  async viewProfile(target: number) {
    // اگر endpoint profile-visitors وجود دارد
    try {
      await this.client.post('/profile-visitors', {
        userId: this.userId,
        profileId: target,
      });
    } catch (e: any) {
      // اگر endpoint وجود نداشت، فقط interaction ثبت کنیم
      if (e.response?.status === 404) {
        console.log(
          `⚠️ endpoint /profile-visitors یافت نشد، فقط interaction ثبت می‌شود`,
        );
      } else {
        throw e;
      }
    }

    // همیشه interaction ثبت شود
    await this.recordInteraction(target, 'view');
  }

  async like(target: number) {
    return this.recordInteraction(target, 'like');
  }

  async superLike(target: number) {
    return this.recordInteraction(target, 'superlike');
  }

  async recordInteraction(targetId: number, type: string) {
    try {
      const response = await this.client.post(
        `/interactions/${targetId}/${type}`,
        {},
        { timeout: 10000 },
      );
      return response.data;
    } catch (e: any) {
      // خطایابی دقیق
      if (e.response) {
        console.log(`📊 [${this.userId}] پاسخ سرور برای ${type}:`, {
          status: e.response.status,
          data: e.response.data,
          headers: e.response.headers,
        });
      }
      throw e;
    }
  }

  async handleError(error: any, action: string, target: number) {
    const status = error.response?.status;
    const errorData = error.response?.data;

    console.log(`❌ [${this.userId}] خطا در ${action} به ${target}:`);
    console.log(`   📊 وضعیت: ${status || 'No status'}`);
    console.log(`   💬 پیام: ${errorData?.message || error.message}`);
    console.log(`   🔧 کد خطا: ${errorData?.error || 'Unknown'}`);

    // اگر توکن منقضی شده، دوباره لاگین کن
    if (status === 401 || status === 403) {
      console.log(
        `🔄 [${this.userId}] توکن منقضی شده، تلاش برای لاگین مجدد...`,
      );
      this.token = undefined;
      await this.login();
    }
  }

  async uploadImage() {
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      console.log(
        `❌ [${this.userId}] فایل تصویر تستی پیدا نشد: ${TEST_IMAGE_PATH}`,
      );
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(TEST_IMAGE_PATH));
      formData.append('isMain', 'true');

      const response = await axios.post(
        `${NEST_API}/user-image/upload`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.token}`,
          },
          timeout: 30000,
        },
      );

      console.log(
        `🖼️  [${this.userId}] تصویر با موفقیت آپلود شد:`,
        response.data,
      );
      return response.data;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در آپلود تصویر: ${errorMsg}`);

      // اگر endpoint وجود ندارد، pass
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint آپلود تصویر وجود ندارد`);
      } else {
        throw e;
      }
    }
  }

  async sendFeedback() {
    const feedbackTypes = [
      'suggestion',
      'assistant',
      'image',
      'matching',
      'general',
    ];
    const feedbackType =
      feedbackTypes[Math.floor(Math.random() * feedbackTypes.length)];

    const feedbackScores = [1, 2, 3, 4, 5];
    const feedbackScore =
      feedbackScores[Math.floor(Math.random() * feedbackScores.length)];

    const reasons = [
      'خیلی مفید بود',
      'می‌توانست بهتر باشد',
      'تجربه خوبی بود',
      'نیاز به بهبود دارد',
      'عالی!',
    ];
    const reason = reasons[Math.floor(Math.random() * reasons.length)];

    try {
      const response = await this.client.post('/feedback', {
        userId: this.userId,
        feature: feedbackType,
        phase: Math.floor(Math.random() * 3) + 1,
        feedback_type: 'explicit',
        value: {
          score: feedbackScore,
          reason: reason,
          comment: `فیدبک تستی از بات شماره ${this.userId}`,
        },
      });

      console.log(`📝 [${this.userId}] فیدبک ارسال شد:`, {
        type: feedbackType,
        score: feedbackScore,
        response: response.data,
      });
      return response.data;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در ارسال فیدبک: ${errorMsg}`);

      // اگر endpoint وجود ندارد، pass
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint فیدبک وجود ندارد`);
      } else {
        throw e;
      }
    }
  }

  async getPhase() {
    try {
      const response = await this.client.get(`/phase/${this.userId}`);

      console.log(`📊 [${this.userId}] فاز کاربر:`, {
        phase: response.data?.phase,
        data: response.data,
      });

      // ذخیره فاز برای استفاده بعدی
      this.userData.phase = response.data?.phase;
      return response.data;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در دریافت فاز: ${errorMsg}`);

      // اگر endpoint وجود ندارد، pass
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint فاز وجود ندارد`);
        // مقدار پیش‌فرض
        this.userData.phase = Math.floor(Math.random() * 3) + 1;
        return { phase: this.userData.phase };
      } else {
        throw e;
      }
    }
  }

  async getProfile() {
    try {
      const response = await this.client.get(`/users/${this.userId}/profile`);

      console.log(`👤 [${this.userId}] پروفایل دریافت شد:`, {
        nickname: response.data?.nickname,
        completed: !!response.data,
      });

      this.userData.profile = response.data;
      return response.data;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در دریافت پروفایل: ${errorMsg}`);

      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint پروفایل وجود ندارد`);
      }
      throw e;
    }
  }

  async getSuggestions() {
    try {
      const response = await this.client.get(
        `/suggestions?userId=${this.userId}`,
      );

      console.log(`💡 [${this.userId}] پیشنهادات دریافت شد:`, {
        count: response.data?.length || 0,
        phase: this.userData.phase || 'نامشخص',
      });

      return response.data;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در دریافت پیشنهادات: ${errorMsg}`);

      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint پیشنهادات وجود ندارد`);
      }
      throw e;
    }
  }

   async getMyProfile() {
    try {
      const response = await this.client.get('/auth/me');
      
      console.log(`👤 [${this.userId}] اطلاعات من:`, {
        nickname: response.data?.nickname,
        id: response.data?.id,
      });
      
      this.userData.myProfile = response.data;
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در دریافت اطلاعات کاربری: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint /auth/me وجود ندارد`);
        // fallback
        return {
          id: this.userId,
          nickname: `user${this.userId}`,
          phone: this.phone,
        };
      }
      throw e;
    }
  }

  async changePassword() {
    try {
      const newPassword = `newpass${Date.now().toString().slice(-6)}`;
      const response = await this.client.post('/auth/change-password', {
        oldPassword: this.password,
        newPassword: newPassword,
      });

      console.log(`🔐 [${this.userId}] رمز عبور تغییر یافت`);
      this.password = newPassword; // به‌روزرسانی رمز در حافظه
      
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در تغییر رمز عبور: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint تغییر رمز عبور وجود ندارد`);
      }
      throw e;
    }
  }

  async getUserProfile(targetId: number) {
    try {
      const response = await this.client.get(`/users/${targetId}`);
      
      console.log(`👥 [${this.userId}] پروفایل کاربر ${targetId}:`, {
        nickname: response.data?.nickname,
        city: response.data?.city,
      });
      
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در دریافت پروفایل کاربر ${targetId}: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint /users/{id} وجود ندارد`);
        // fallback
        return {
          id: targetId,
          nickname: `user${targetId}`,
        };
      }
      throw e;
    }
  }

  async acceptRandomSuggestion() {
    // اگر suggestionIds خالی است، ابتدا دریافت کن
    if (this.suggestionIds.length === 0) {
      await this.getSuggestions();
    }

    if (this.suggestionIds.length === 0) {
      console.log(`⚠️ [${this.userId}] هیچ پیشنهادی برای قبول کردن وجود ندارد`);
      return;
    }

    const suggestionId = this.suggestionIds[Math.floor(Math.random() * this.suggestionIds.length)];
    
    try {
      const response = await this.client.post('/suggestions/accept-suggestion', {
        suggestionId,
        rank: Math.floor(Math.random() * 10) + 1,
        feedback: 'پیشنهاد خوبی بود',
      });

      console.log(`👍 [${this.userId}] پیشنهاد ${suggestionId} قبول شد:`, {
        rank: response.data?.rank,
      });
      
      // حذف از لیست
      this.suggestionIds = this.suggestionIds.filter(id => id !== suggestionId);
      
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در قبول پیشنهاد: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint قبول پیشنهاد وجود ندارد`);
      }
      throw e;
    }
  }

  async reportUser(targetId: number) {
    const reasons = ['spam', 'inappropriate_content', 'fake_profile', 'harassment', 'other'];
    
    try {
      const response = await this.client.post('/report-block/report', {
        reporterId: this.userId,
        reportedUserId: targetId,
        reason: reasons[Math.floor(Math.random() * reasons.length)],
        message: 'این کاربر در تست سیمولاتور گزارش شد',
      });

      console.log(`🚨 [${this.userId}] کاربر ${targetId} گزارش شد:`, {
        reason: response.data?.reason,
      });
      
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در گزارش کاربر: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint گزارش کاربر وجود ندارد`);
      }
      throw e;
    }
  }

  async blockUser(targetId: number) {
    try {
      const response = await this.client.post('/report-block/block', {
        userId: this.userId,
        targetId,
        reason: 'تست سیمولاتور',
      });

      console.log(`🚫 [${this.userId}] کاربر ${targetId} بلاک شد`);
      
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در بلاک کاربر: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint بلاک کاربر وجود ندارد`);
      }
      throw e;
    }
  }

  async getSentInteractions() {
    try {
      const response = await this.client.get('/interactions/sent');
      
      console.log(`📤 [${this.userId}] تعاملات ارسالی:`, {
        count: response.data?.length || 0,
      });
      
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در دریافت تعاملات ارسالی: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint تعاملات ارسالی وجود ندارد`);
        return [];
      }
      throw e;
    }
  }

  async getReceivedInteractions() {
    try {
      const response = await this.client.get('/interactions/received');
      
      console.log(`📥 [${this.userId}] تعاملات دریافتی:`, {
        count: response.data?.length || 0,
      });
      
      return response.data;
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در دریافت تعاملات دریافتی: ${errorMsg}`);
      
      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint تعاملات دریافتی وجود ندارد`);
        return [];
      }
      throw e;
    }
  }

}

class RealSimulator {
  bots: RealBot[] = [];

  constructor() {
    for (let i = 1; i <= TOTAL_BOTS; i++) {
      this.bots.push(new RealBot(i));
    }
  }

  async start() {
    console.log(`🚀 شروع سیمولاتور با ${TOTAL_BOTS} بات`);
    console.log(`⏱️  هر ${TICK_EVERY_MS / 1000} ثانیه یک تیک`);
    console.log(`🎲 احتمال اکشن در هر تیک: ${ACTION_PROB * 100}%\n`);

    // لاگین اولیه همه بات‌ها
    const loginResults = await Promise.allSettled(
      this.bots.map((bot) => bot.login()),
    );

    const successfulLogins = loginResults.filter(
      (r) => r.status === 'fulfilled',
    ).length;
    console.log(
      `\n✅ ${successfulLogins} از ${TOTAL_BOTS} بات با موفقیت لاگین شدند\n`,
    );

    // شروع تایمر
    let tickCount = 0;
    setInterval(async () => {
      tickCount++;
      await this.tick(tickCount);
    }, TICK_EVERY_MS);
  }

  async tick(tickNumber: number) {
    const activeBots = this.bots.filter(() => Math.random() < ACTION_PROB);

    console.log(`\n🔄 تیک #${tickNumber} — ${activeBots.length} بات فعال`);

    for (const bot of activeBots) {
      await bot.act();
      await setTimeout(500); // فاصله بین اکشن‌ها
    }

    // خلاصه وضعیت
    this.printStatus();
  }

  printStatus() {
    console.log('\n📊 خلاصه وضعیت بات‌ها:');
    this.bots.forEach((bot) => {
      console.log(`   🤖 ${bot.phone}: ${bot.token ? '✅ متصل' : '❌ قطع'}`);
    });
  }
}

// اجرای سیمولاتور
async function main() {
  const sim = new RealSimulator();
  await sim.start();
}

main().catch(console.error);
