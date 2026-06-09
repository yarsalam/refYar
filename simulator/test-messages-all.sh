#!/bin/bash
BASE="http://localhost:5001"; FROM=1; TO=2

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 💬 تست کامل Messages ==="

# ۱. sendMessage
echo "1) sendMessage(dto)"
echo "   نقش: ارسال پیام + چک moderation + چک credits + یادگیری فاز"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"from_id\":$FROM, \"to_id\":$TO, \"content\":\"سلام، خوبی؟ این یک پیام تست نسبتا طولانی برای بررسی کیفیت پیام است\"}" \
  $BASE/messages)
echo "   وضعیت HTTP: $STATUS (201=✅)"

# ۲. getInbox
echo "2) getInbox(userId)"
echo "   نقش: دریافت پیام‌های دریافتی کاربر"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/messages/inbox/$TO" | jq '. | length'
echo ""

# ۳. getSent
echo "3) getSent(userId)"
echo "   نقش: دریافت پیام‌های ارسالی کاربر"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/messages/sent/$FROM" | jq '. | length'
echo ""

# ۴. markAsRead (نیاز به messageId=1)
echo "4) markAsRead(messageId)"
echo "   نقش: علامت‌گذاری پیام به عنوان خوانده‌شده"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH -H "Authorization: Bearer $TOKEN" \
  "$BASE/messages/read/1")
echo "   وضعیت HTTP: $STATUS (200=✅)"

# ۵. deleteFromInbox
echo "5) deleteFromInbox(messageId, userId)"
echo "   نقش: حذف پیام از اینباکس"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/messages/inbox/1?userId=$TO")
echo "   وضعیت HTTP: $STATUS (200=✅)"

# ۶. getInboxGroupedByUser
echo "6) getInboxGroupedByUser(userId)"
echo "   نقش: اینباکس گروه‌بندی‌شده بر اساس فرستنده"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/messages/inbox/grouped/$TO" | jq '. | length'
echo ""

echo "=== ✅ پایان تست کامل Messages ==="
