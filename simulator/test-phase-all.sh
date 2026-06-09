#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 📊 تست کامل Phase ==="

# ۱. get (خواندن فاز کاربر)
echo "1) get(userId)"
echo "   نقش: دریافت رکورد فاز کاربر (cold/warm/hot)"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/phase/1" | jq '{phase, score, learningScore}'
echo ""

# ۲. calculate (محاسبه مجدد فاز)
echo "2) calculate(userId, metrics?)"
echo "   نقش: محاسبه امتیاز فاز بر اساس متریک‌های واقعی"
echo "   (با هر learnFromFeedback فراخوانی می‌شود – خروجی در Redis بررسی شود)"
echo ""

# ۳. getPhaseMetrics
echo "3) getPhaseMetrics(userId)"
echo "   نقش: دریافت آمار کامل فاز (پرسنتایل، آستانه، پیشنهادات)"
echo "   (همان خروجی get است + فیلدهای بیشتر)"
echo ""

# ۴. learnFromFeedback
echo "4) learnFromFeedback(userId, event)"
echo "   نقش: یادگیری تقویتی وزن‌ها (با purchase, match, message, boost_used, churn, profile_completed)"
echo "   (با هر تعامل فراخوانی می‌شود – نتیجه در لاگ NestJS و Redis)"
echo ""

# ۵. markEverPaid
echo "5) markEverPaid(userId)"
echo "   نقش: علامت‌گذاری کاربر به عنوان خریدار"
echo "   (با اولین خرید فراخوانی می‌شود)"
echo ""

# ۶. getPhaseDistribution
echo "6) getPhaseDistribution()"
echo "   نقش: توزیع درصدی کاربران در هر فاز (برای داشبورد ادمین)"
echo "   (بدون endpoint – از طریق سرویس داخلی)"
echo ""

echo "=== ✅ پایان تست کامل Phase ==="
