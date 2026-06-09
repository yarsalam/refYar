#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 💰 تست Payments (grantBundle) ==="

# ابتدا یک ProductBundle تستی در دیتابیس می‌سازیم (اگر وجود ندارد)
docker compose exec mysql mysql -uroot -proot123 yarsalam -e "
INSERT INTO product_bundles (code, items, price, active) 
VALUES ('starter_bundle', '[{\"type\":\"credits\",\"amount\":20},{\"type\":\"boost\",\"amount\":2}]', 99000, 1)
ON DUPLICATE KEY UPDATE active=1;
" 2>/dev/null

# فراخوانی grantBundle
echo "1) grantBundle(userId=1, 'starter_bundle')"
GRANT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  $BASE/payments/grantBundle/1/starter_bundle)
echo "   پاسخ: $GRANT"
echo ""

# بررسی وزن pastPayments در Redis
echo "2) phase:weight:pastPayments بعد از خرید:"
docker compose exec redis redis-cli GET "phase:weight:pastPayments" 2>/dev/null || echo "   (هنوز رویداد پردازش نشده)"

# لاگ Phase adjustment
echo "3) آخرین لاگ‌های Phase (یادگیری):"
docker compose logs backend --tail 15 | grep "adjusted"

echo "=== ✅ پایان تست Payments ==="
