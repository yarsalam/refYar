#!/bin/bash
BASE="http://localhost:5001"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"09120000001","password":"123456","platform":"web"}' | jq -r '.token')

echo "=== 📢 تست Promotion ==="
echo "1) تصمیم‌گیری تبلیغاتی (PromotionEngine):"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"features":{"engagement_score":0.7,"dismiss_rate":0.2,"last_purchase_days":10},"candidates":["boost","vip","credit"]}' \
  $BASE/promotion/decide 2>/dev/null || echo "   (endpoint /promotion/decide وجود ندارد - PromotionEngineService فقط داخلی استفاده می‌شود)"
echo ""

echo "2) ثبت رد کردن تبلیغ (همان dismissPromotion در Feed):"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/feed/dismiss/promo-test-123" | jq '.'
echo ""

echo "=== ✅ پایان تست Promotion ==="
