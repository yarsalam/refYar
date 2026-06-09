#!/bin/bash
BASE="http://localhost:5001"
PHONE="09120000001"
PASSWORD="123456"

echo "========================================="
echo "   🧪 تست ماژول Auth (کاربر موجود)"
echo "========================================="
echo ""

# ──────────────────────────────────────────
# ۱. login
# ──────────────────────────────────────────
echo "۱. 🔐 ورود با رمز عبور"
LOGIN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\",\"platform\":\"web\"}")
TOKEN=$(echo "$LOGIN" | jq -r '.token')
if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "   ✅ توکن: ${TOKEN:0:40}..."
else
  echo "   ❌ خطا: $LOGIN"
  exit 1
fi
echo ""

# ──────────────────────────────────────────
# ۲. me
# ──────────────────────────────────────────
echo "۲. 👤 دریافت پروفایل من"
ME=$(curl -s -H "Authorization: Bearer $TOKEN" $BASE/auth/me)
echo "   $(echo $ME | jq -c '{id, nickname, phone, isCompleted}')"
echo ""

# ──────────────────────────────────────────
# ۳. change-password
# ──────────────────────────────────────────
echo "۳. 🔒 تغییر رمز عبور"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"123456"}' \
  $BASE/auth/change-password)
echo "   وضعیت: $STATUS (200=✅)"
echo ""

# ──────────────────────────────────────────
# ۴. register-status
# ──────────────────────────────────────────
echo "۴. 📞 وضعیت ثبت‌نام"
STATUS=$(curl -s "$BASE/auth/mobile/register-status?phone=$PHONE")
echo "   $(echo $STATUS | jq -c '.')"
echo ""

# ──────────────────────────────────────────
# ۵. logout
# ──────────────────────────────────────────
echo "۵. 🚪 خروج"
LOGOUT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"web"}' \
  $BASE/auth/logout)
echo "   پاسخ: $LOGOUT"
echo ""

# ──────────────────────────────────────────
# ۶. step1 (اختیاری – ساخت کاربر جدید)
# ──────────────────────────────────────────
echo "۶. 📝 ثبت‌نام اولیه (اختیاری)"
STEP1=$(curl -s -X POST $BASE/auth/register/step1 \
  -H "Content-Type: application/json" \
  -H "x-device-id: test-device-99" \
  -H "x-platform: mobile" \
  -d '{"phone":"09129999999","gender":"male","platform":"mobile"}')
echo "   پاسخ: $(echo $STEP1 | jq -c '.')"
echo ""

echo "========================================="
echo "   ✅ پایان تست Auth"
echo "========================================="
