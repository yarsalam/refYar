#!/bin/bash
BASE="http://localhost:5001"
PHONE="09120000001"          # کاربر ۱
TARGET_ID=2                  # کاربر ۲

# ۱. لاگین و گرفتن توکن
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"'"$PHONE"'","password":"123456","platform":"web"}' | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ خطا در لاگین"
  exit 1
fi

echo "=== ❤️ تست کامل Interactions ==="

# ۲. لایک
echo -n "۱. لایک به $TARGET_ID: "
LIKE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" "$BASE/interactions/$TARGET_ID/like")
echo "$LIKE_STATUS (200=✅)"

# ۳. سوپرلایک
echo -n "۲. سوپرلایک به $TARGET_ID: "
SUPER_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" "$BASE/interactions/$TARGET_ID/superlike")
echo "$SUPER_STATUS (200=✅)"

# ۴. مشاهده پروفایل (view)
echo -n "۳. بازدید پروفایل $TARGET_ID: "
VIEW_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" "$BASE/interactions/$TARGET_ID/view")
echo "$VIEW_STATUS (200=✅)"

# ۵. پیام (message) – اگر endpoint دارد
echo -n "۴. تعامل پیام به $TARGET_ID: "
MSG_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" "$BASE/interactions/$TARGET_ID/message")
echo "$MSG_STATUS (200=✅)"

# ۶. تعاملات ارسالی
echo "۵. تعاملات ارسالی:"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/interactions/sent" | jq '. | length'

# ۷. تعاملات دریافتی
echo "۶. تعاملات دریافتی:"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/interactions/received" | jq '. | length'

echo "=== ✅ پایان تست Interactions ==="
