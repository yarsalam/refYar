#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 🔔 تست کامل Notifications ==="

# ۱. createNotification
echo "1) createNotification(data)"
echo "   نقش: ایجاد و ذخیره نوتیفیکیشن + dispatch از طریق WebSocket"
NOTIF=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"type":"message","message":"تست نوتیفیکیشن","related_id":1}' \
  $BASE/notifications)
echo "   پاسخ: $(echo $NOTIF | jq -c '.')"
echo ""

# ۲. getUserNotifications
echo "2) getUserNotifications(userId)"
echo "   نقش: دریافت لیست نوتیفیکیشن‌های کاربر"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/notifications/1" | jq '. | length'
echo ""

# ۳. markAsRead
echo "3) markAsRead(notificationId)"
echo "   نقش: علامت‌گذاری نوتیفیکیشن به عنوان خوانده‌شده"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH -H "Authorization: Bearer $TOKEN" \
  "$BASE/notifications/read/1")
echo "   وضعیت HTTP: $STATUS (200=✅)"

# ۴. countUnread
echo "4) countUnread(userId)"
echo "   نقش: شمارش نوتیفیکیشن‌های خوانده‌نشده"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/notifications/unread/count/1"
echo ""

echo "=== ✅ پایان تست کامل Notifications ==="
