#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 🚀 تست Boost ==="
echo "1) اعطای Boost رایگان (برای کاربر cold):"
# فراخوانی grantFreeOnce از BoostService (نیاز به endpoint در BoostsController)
# در صورت نبود endpoint، می‌توانیم مستقیماً از طریق SQL یا سرویس تست کنیم.
echo "   فعلاً endpoint مستقیم ندارد. می‌توانید از طریق grantBundle تست کنید."
echo ""
echo "2) بررسی Boost کاربر:"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/boost/status/1" 2>/dev/null || echo "   (endpoint وجود ندارد)"
echo ""
echo "=== ✅ پایان تست Boost ==="
