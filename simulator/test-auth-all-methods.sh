#!/bin/bash
BASE="http://localhost:5001"
PHONE="09120000001"
PASSWORD="123456"

echo "========================================="
echo "   🧪 تست تکتک متدهای AuthService"
echo "========================================="
echo ""

# ۱. Login
echo "1) login(phone, password)"
echo "   نقش: احراز هویت با رمز و برگرداندن JWT"
RESP=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\",\"platform\":\"web\"}")
TOKEN=$(echo "$RESP" | jq -r '.token')
echo "   ✅ توکن: ${TOKEN:0:40}..."
echo ""

# ۲. getProfile
echo "2) getProfile(payload)"
echo "   نقش: دریافت پروفایل کاربر لاگین‌شده"
curl -s -H "Authorization: Bearer $TOKEN" $BASE/auth/me | jq '{id, nickname, phone, isCompleted}'
echo ""

# ۳. getRegisterStatus
echo "3) getRegisterStatus(phone)"
echo "   نقش: بررسی وضعیت ثبت‌نام (راهنمای فرانت)"
curl -s "$BASE/auth/mobile/register-status?phone=$PHONE" | jq '.'
echo ""

# ۴. changePassword
echo "4) changePassword(userId, newPassword)"
echo "   نقش: تغییر رمز عبور کاربر"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"password":"123456"}' $BASE/auth/change-password)
echo "   وضعیت HTTP: $STATUS (200=✅, 201=✅)"
echo ""

# ۵. logout
echo "5) logout"
echo "   نقش: ثبت خروج در UserEvent (اختیاری: پاک کردن cookie)"
LOGOUT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"platform":"web"}' \
  $BASE/auth/logout)
HTTP_LOGOUT=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"platform":"web"}' $BASE/auth/logout)
echo "   پاسخ: $LOGOUT (HTTP $HTTP_LOGOUT)"
echo ""

# ۶. step1 (اختیاری)
echo "6) step1(dto, req)"
echo "   نقش: ثبت‌نام اولیه (قبل از OTP)"
STEP1=$(curl -s -X POST $BASE/auth/register/step1 \
  -H "Content-Type: application/json" \
  -H "x-device-id: test-device-99" \
  -H "x-platform: mobile" \
  -d '{"phone":"09129999999","gender":"male","platform":"mobile"}')
echo "   پاسخ: $(echo $STEP1 | jq -c '.' 2>/dev/null || echo 'OK (بدون خروجی)')"
echo ""

# ۷. completeVerification (نیاز به user در Redis)
echo "7) completeVerification(phone, deviceId)"
echo "   نقش: تأیید OTP و دریافت توکن موقت"
docker compose exec redis redis-cli SET "tg:verified:09129999999" "1" > /dev/null 2>&1
docker compose exec redis redis-cli SET "wa:verified:09129999999" "1" > /dev/null 2>&1
VERIFY=$(curl -s -X POST $BASE/auth/register/complete-verification \
  -H "Content-Type: application/json" \
  -H "x-device-id: test-device-99" \
  -H "x-platform: mobile" \
  -d '{"phone":"09129999999"}')
TEMP_TOKEN=$(echo "$VERIFY" | jq -r '.token // empty')
if [ -n "$TEMP_TOKEN" ]; then
  echo "   ✅ توکن موقت: ${TEMP_TOKEN:0:40}..."
else
  echo "   ❌ خطا: $VERIFY"
fi
echo ""

# ۸. completeProfile (با توکن موقت)
echo "8) completeProfile(dto, user)"
echo "   نقش: تکمیل پروفایل و دریافت توکن نهایی"
if [ -n "$TEMP_TOKEN" ]; then
  PROFILE=$(curl -s -X POST $BASE/auth/register/completeProfile \
    -H "Authorization: Bearer $TEMP_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "nickname":"تست_جدید",
      "birthDate":{"day":"15","month":"06","year":"1375"},
      "marital":"single","province":"تهران","city":"تهران","nationality":"ایرانی",
      "education":"bachelor","employment":"employee","height":"175","weight":"70",
      "health":"سالم","religion":"اسلام",
      "aboutme":"تست","values_self":["صداقت"],"hobbies_self":["کتاب"],
      "partner_about":"تست","values_partner":["وفاداری"],"hobbies_partner":["موسیقی"],
      "password":"123456"
    }')
  FINAL_TOKEN=$(echo "$PROFILE" | jq -r '.token // empty')
  if [ -n "$FINAL_TOKEN" ]; then
    echo "   ✅ پروفایل تکمیل شد – توکن نهایی: ${FINAL_TOKEN:0:40}..."
  else
    echo "   ⚠️ پاسخ: $(echo $PROFILE | jq -c '.')"
  fi
else
  echo "   ⏭️  رد شد (توکن موقت نداشتیم)"
fi
echo ""

echo "========================================="
echo "   ✅ پایان تست تمام متدهای Auth"
echo "========================================="
