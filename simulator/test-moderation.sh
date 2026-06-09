#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 🛡️ تست Moderation ==="
echo "1) بررسی یک متن امن:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"سلام خوبی؟","receiverId":2}' \
  $BASE/moderation/check | jq '.'
echo ""

echo "2) بررسی یک متن با ریسک کلاهبرداری:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"شماره کارتم ۶۰۳۷۹۹... بیا تلگرام","receiverId":2}' \
  $BASE/moderation/check | jq '.'
echo ""

echo "=== ✅ پایان تست Moderation ==="
