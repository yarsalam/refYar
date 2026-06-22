/**
 * PaywallPolicyEngine
 *
 * یک ارزیاب قانون خالص (pure rule evaluator) — هیچ dependency inject
 * شده‌ای ندارد و کاملاً قابل unit-test است بدون نیاز به mock.
 *
 * تمام داده‌ها از PaywallDecisionService (که orchestrator است) جمع‌آوری
 * می‌شوند و به صورت PaywallContext به این کلاس داده می‌شوند. منطق تصمیم
 * فقط اینجاست — نه در PaywallDecisionService، نه در MessageService.
 *
 * قوانین به ترتیب اولویت:
 *   ۱. VIP → همیشه مجاز
 *   ۲. ریسک دستگاه بالا → همیشه ممنوع (فریب‌کار بالقوه)
 *   ۳. فاز Cold + Trust بالا + Device Risk پایین → رایگان
 *   ۴. اعتبار کافی → مصرف اعتبار
 *   ۵. در غیر این صورت → Paywall
 */

export interface PaywallContext {
  /** فاز engagement کاربر: cold | warm | hot */
  phase: string;
  /** ۰–۱۰۰: اعتماد کاربر (هویت، رفتار، گزارش) */
  trustScore: number;
  /** ۰–۱۰۰: ریسک دستگاه (چند حساب / چند دستگاه) */
  deviceRisk: number;
  /** LTV پیش‌بینی‌شده (تومان) — برای تصمیم‌های آینده */
  predictedLtv: number;
  /** موجودی اعتبار */
  credits: number;
  /** آیا اشتراک VIP فعال دارد؟ */
  vip: boolean;
}

export type DenyReason = 'high_device_risk' | 'credits_required';

export type AllowReason = 'vip' | 'cold_phase_trusted' | 'credits_available';

export interface PolicyResult {
  allowed: boolean;
  reason?: AllowReason;
  denyReason?: DenyReason;
  /** آیا باید اعتبار مصرف شود؟ (فقط وقتی allowed=true و reason='credits_available') */
  consumeCredits: boolean;
}

// ─── آستانه‌های قابل‌تنظیم ─────────────────────────────────────────────────

/**
 * حداقل trust برای اینکه کاربر Cold رایگان تلقی شود.
 * کاربرانی با trust کمتر از این مقدار (حساب‌های مشکوک تازه‌ساز) باید اعتبار بخرند.
 */
const COLD_FREE_MIN_TRUST = 50;

/**
 * حداکثر deviceRisk برای اینکه کاربر Cold رایگان تلقی شود.
 * اگر deviceRisk از این بالاتر باشد، کاربر Cold هم باید اعتبار داشته باشد.
 */
const COLD_FREE_MAX_DEVICE_RISK = 40;

/**
 * آستانه‌ی ریسک دستگاه برای رد کامل (deny).
 * بالای این مقدار = احتمال جدی فریب/multi-account → Paywall همیشگی.
 */
const HIGH_RISK_THRESHOLD = 80;

// ─── Policy evaluator ────────────────────────────────────────────────────────

export function evaluatePaywallPolicy(ctx: PaywallContext): PolicyResult {
  // ۱. VIP: همیشه مجاز، هرگز اعتبار مصرف نمی‌شود.
  if (ctx.vip) {
    return { allowed: true, reason: 'vip', consumeCredits: false };
  }

  // ۲. ریسک دستگاه بالا: حتی در فاز Cold هم رایگان نیست.
  //    این قانون قبل از فاز بررسی می‌شود تا حساب‌های multi-device از
  //    سیستم Cold-free سوءاستفاده نکنند.
  if (ctx.deviceRisk > HIGH_RISK_THRESHOLD) {
    return {
      allowed: false,
      denyReason: 'high_device_risk',
      consumeCredits: false,
    };
  }

  // ۳. فاز Cold با Trust کافی و Device Risk پایین: رایگان.
  //    Trust < COLD_FREE_MIN_TRUST = حساب مشکوک، رایگان نیست.
  //    DeviceRisk > COLD_FREE_MAX_DEVICE_RISK = الگوی ساختگی، رایگان نیست.
  if (
    ctx.phase === 'cold' &&
    ctx.trustScore >= COLD_FREE_MIN_TRUST &&
    ctx.deviceRisk <= COLD_FREE_MAX_DEVICE_RISK
  ) {
    return {
      allowed: true,
      reason: 'cold_phase_trusted',
      consumeCredits: false,
    };
  }

  // ۴. اعتبار کافی: مصرف اعتبار.
  //    (در این مرحله: warm/hot بدون VIP، یا cold با trust/deviceRisk ناکافی)
  if (ctx.credits > 0) {
    return { allowed: true, reason: 'credits_available', consumeCredits: true };
  }

  // ۵. هیچ‌کدام: Paywall.
  return {
    allowed: false,
    denyReason: 'credits_required',
    consumeCredits: false,
  };
}
