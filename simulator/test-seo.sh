#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 📈 تست SEO ==="
echo "1) داشبورد سئو:"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/seo/dashboard" | jq '.'
echo ""

echo "2) داشبورد درآمدی سئو:"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/seo/revenue-dashboard" | jq '.'
echo ""
echo "=== ✅ پایان تست SEO ==="
