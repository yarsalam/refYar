#!/bin/bash
set -e

echo "🏗️  Building base images..."
echo "========================"

cd ../base-images

# ۱. حذف ایمیج‌های قدیمی (اختیاری)
read -p "حذف ایمیج‌های قدیمی؟ (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker rmi python-ai-core python-ai-ml-lite python-ai-nlp python-ai-tf 2>/dev/null || true
fi

# ۲. بیلد core
echo ""
echo "📦 Building python-ai-core..."
docker build -f Dockerfile.core -t python-ai-core:latest .

# ۳. بیلد ml-lite
echo ""
echo "📦 Building python-ai-ml-lite..."
docker build -f Dockerfile.ml-lite -t python-ai-ml-lite:latest .

# ۴. بیلد nlp
echo ""
echo "📦 Building python-ai-nlp..."
docker build -f Dockerfile.nlp -t python-ai-nlp:latest .

# ۵. بیلد tf
echo ""
echo "📦 Building python-ai-tf..."
docker build -f Dockerfile.tf -t python-ai-tf:latest .

# ۶. نمایش نتیجه
echo ""
echo "========================"
echo "✅ Build completed!"
echo ""
docker images | grep python-ai