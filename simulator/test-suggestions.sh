#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 💡 تست Suggestion ==="
echo "1) دریافت پیشنهادات برای کاربر ۱:"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/suggestions?userId=1&limit=5" | jq '. | length'
echo ""

echo "2) پذیرفتن یک پیشنهاد:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"suggestionId":2,"rank":1}' \
  $BASE/suggestions/accept-suggestion | jq '.'
echo ""

echo "=== ✅ پایان تست Suggestion ==="
