#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 💰 تست Payments (grantBundle) ==="

# ثبت Bundle در صورت عدم وجود
docker compose exec mysql mysql -uroot -proot123 yarsalam -e "INSERT IGNORE INTO product_bundles (code, items, price, active) VALUES ('starter_bundle', '[{\"type\":\"credits\",\"amount\":20},{\"type\":\"boost\",\"amount\":2}]', 99000, 1);" 2>/dev/null

echo "1) فراخوانی grantBundle برای کاربر ۱"
RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/payments/grant-bundle/1/starter_bundle")
echo "   پاسخ: $RESP"
echo ""

echo "2) وزن pastPayments در Redis بعد از خرید:"
sleep 1
docker compose exec redis redis-cli GET "phase:weight:pastPayments" 2>/dev/null || echo "   (nil)"
echo ""

echo "3) فاز کاربر ۱:"
sleep 1
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/phase/1" | jq '{phase, score}'
echo ""

echo "=== ✅ پایان تست Payments ==="
