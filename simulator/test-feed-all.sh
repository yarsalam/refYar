#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 📱 تست کامل Feed ==="

# ۱. buildFeed
echo "1) buildFeed(userId, options)"
echo "   نقش: ساخت فید شخصی‌سازی‌شده شامل کاربران + تبلیغات"
FEED=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/feed?limit=5")
echo "   تعداد آیتم: $(echo $FEED | jq '.data | length')"
echo "   نوع آیتم‌ها: $(echo $FEED | jq -c '[.data[].type]')"
echo "   آیتم اول: $(echo $FEED | jq -c '.data[0]')"
echo ""

# ۲. getUserFeedQuality
echo "2) getUserFeedQuality(userId)"
echo "   نقش: ارزیابی کیفیت فید (در صورت پیاده‌سازی)"
echo "   (متد خالی است – صرفاً جهت اطلاع)"
echo ""

# ۳. invalidateFeedCache
echo "3) invalidateFeedCache(userId)"
echo "   نقش: پاک کردن کش فید کاربر"
echo "   (قابل فراخوانی از طریق سرویس – بدون endpoint)"
echo ""

# ۴. dismissPromotion
echo "4) dismissPromotion (POST /feed/dismiss/:id)"
echo "   نقش: ثبت رد کردن تبلیغ توسط کاربر"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/feed/dismiss/promo-123")
echo "   وضعیت HTTP: $STATUS (200=✅)"
echo ""

echo "=== ✅ پایان تست کامل Feed ==="
