import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// --------------------- کلاس AuthBot (اصلاح‌شده) ---------------------
const TOTAL_BOTS = 5; // با تعداد کاربران seed شده هماهنگ کن
const NEST_API = 'http://127.0.0.1:5001'; // پورت واقعی NestJS
const SIM_DURATION_MIN = 5; // چند دقیقه اجرا شود
const TICK_EVERY_MS = 10000; // هر ۸ ثانیه یک تیک
const ACTION_PROB = 0.45;
const TEST_IMAGE_PATH = path.join(__dirname, 'test.jpg');

export class AuthBot {
  phone: string;
  password = '123456';
  token?: string;
  client!: AxiosInstance;
  userId: number;
  suggestionIds: number[] = [];
  userData: any = {};

  constructor(userId: number) {
    this.userId = userId;
    this.phone = `0912${userId.toString().padStart(7, '0')}`;
  }

  async login() {
    const res = await axios.post(`${NEST_API}/auth/login`, {
      phone: this.phone,
      password: this.password,
      platform: 'web',
    });

    this.token = res.data.token || res.data.access_token;
    if (!this.token) throw new Error('توکن دریافت نشد');

    this.client = axios.create({
      baseURL: NEST_API,
      headers: { Authorization: `Bearer ${this.token}` },
      timeout: 15000,
    });

    console.log(`🤖 ${this.phone} لاگین شد`);
  }

  async sendMessage(to: number) {
    await this.client.post('/messages', {
      from_id: this.userId,
      to_id: to,
      content: 'سلام 👋',
      is_free: true,
    });

    // ✅ لاگ interaction برای پیام
    await this.client.post(`/interactions/${to}/message`);
  }

  async viewProfile(target: number) {
    return this.client.post('/profile-visitors', {
      userId: this.userId,
      profileId: target,
    });
  }

  async like(target: number) {
    return this.client.post(`/interactions/${target}/like`);
  }

  async superLike(target: number) {
    return this.client.post(`/interactions/${target}/superlike`);
  }

  async uploadImage() {
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      console.log(`فایل ${TEST_IMAGE_PATH} پیدا نشد — آپلود رد شد`);
      return;
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_IMAGE_PATH));
    form.append('isMain', 'true');

    return this.client.post('/user-image/upload', form, {
      headers: { ...form.getHeaders() },
    });
  }

  async sendFeedback() {
    return this.client.post('/feedback', {
      userId: Number(this.userId),
      feature: 'assistant',
      phase: 3,
      value: { score: Math.floor(Math.random() * 3) + 3 },
    });
  }

  async getPhase() {
    return this.client.get(`/phase/${this.userId}`);
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
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(
        `❌ [${this.userId}] خطا در دریافت اطلاعات کاربری: ${errorMsg}`,
      );

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
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
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
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(
        `❌ [${this.userId}] خطا در دریافت پروفایل کاربر ${targetId}: ${errorMsg}`,
      );

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

    const suggestionId =
      this.suggestionIds[Math.floor(Math.random() * this.suggestionIds.length)];

    try {
      const response = await this.client.post(
        '/suggestions/accept-suggestion',
        {
          suggestionId,
          rank: Math.floor(Math.random() * 10) + 1,
          feedback: 'پیشنهاد خوبی بود',
        },
      );

      console.log(`👍 [${this.userId}] پیشنهاد ${suggestionId} قبول شد:`, {
        rank: response.data?.rank,
      });

      // حذف از لیست
      this.suggestionIds = this.suggestionIds.filter(
        (id) => id !== suggestionId,
      );

      return response.data;
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(`❌ [${this.userId}] خطا در قبول پیشنهاد: ${errorMsg}`);

      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint قبول پیشنهاد وجود ندارد`);
      }
      throw e;
    }
  }

  async reportUser(targetId: number) {
    const reasons = [
      'spam',
      'inappropriate_content',
      'fake_profile',
      'harassment',
      'other',
    ];

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
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
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
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
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
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(
        `❌ [${this.userId}] خطا در دریافت تعاملات ارسالی: ${errorMsg}`,
      );

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
      const errorMsg =
        e?.response?.data?.message || e.message || 'Unknown error';
      console.log(
        `❌ [${this.userId}] خطا در دریافت تعاملات دریافتی: ${errorMsg}`,
      );

      if (e.response?.status === 404) {
        console.log(`⚠️ [${this.userId}] endpoint تعاملات دریافتی وجود ندارد`);
        return [];
      }
      throw e;
    }
  }
}
