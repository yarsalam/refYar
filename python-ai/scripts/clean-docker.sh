#!/bin/bash
set -e

echo "🧹 پاک‌سازی کامل داکر..."
echo "========================"

# توقف همه کنتینرها
echo "⏹️  توقف کنتینرها..."
docker stop $(docker ps -aq) 2>/dev/null || true

# حذف همه کنتینرها
echo "🗑️  حذف کنتینرها..."
docker rm $(docker ps -aq) 2>/dev/null || true

# حذف همه ایمیج‌ها
echo "🖼️  حذف ایمیج‌ها..."
docker rmi -f $(docker images -q) 2>/dev/null || true

# پاک‌سازی نهایی
echo "🧽 پاک‌سازی کش..."
docker system prune -a -f --volumes

# نتیجه
echo ""
echo "✅ پاک‌سازی کامل شد!"
echo ""
docker images
docker ps -a