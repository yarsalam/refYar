#!/bin/bash
BASE="http://localhost:5001"
P1="09120000001"
P2="09120000002"

TOKEN1=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d "{\"phone\":\"$P1\",\"password\":\"123456\",\"platform\":\"web\"}" | jq -r '.token')
TOKEN2=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d "{\"phone\":\"$P2\",\"password\":\"123456\",\"platform\":\"web\"}" | jq -r '.token')

echo "=== 🔄 تست کامل چرخه یادگیری ==="
echo "1) Match مصنوعی (لایک متقابل)"
curl -s -o /dev/null -X POST -H "Authorization: Bearer $TOKEN1" $BASE/interactions/2/like
curl -s -o /dev/null -X POST -H "Authorization: Bearer $TOKEN2" $BASE/interactions/1/like
echo "   ✅ لایک متقابل ارسال شد"
echo ""

echo "2) وزن matches بعد از Match:"
sleep 1
docker compose exec redis redis-cli GET "phase:weight:matches"
echo ""

echo "3) خرید Bundle توسط کاربر ۱"
curl -s -X POST -H "Authorization: Bearer $TOKEN1" $BASE/payments/grant-bundle/1/starter_bundle
echo ""

echo "4) وزن pastPayments بعد از خرید:"
sleep 1
docker compose exec redis redis-cli GET "phase:weight:pastPayments"
echo ""

echo "5) فاز کاربر ۱:"
curl -s -H "Authorization: Bearer $TOKEN1" $BASE/phase/1 | jq '{phase, score}'
echo ""

echo "6) فید کاربر ۱:"
FEED=$(curl -s -H "Authorization: Bearer $TOKEN1" "$BASE/feed?limit=5")
echo "   تعداد آیتم: $(echo $FEED | jq '.data | length')"
echo ""

echo "=== ✅ پایان تست چرخه کامل ==="
