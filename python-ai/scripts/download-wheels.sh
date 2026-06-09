#!/bin/bash
set -e

echo "📦 Starting wheel download with resume capability..."
echo "================================================"

WHEELS_DIR="../downloaded_wheels"
REQUIREMENTS_DIR="../requirements"

mkdir -p $WHEELS_DIR
cd $WHEELS_DIR

# تابع بررسی وجود پکیج
package_exists() {
    local package=$1
    # استخراج اسم اصلی پکیج (بدون ورژن)
    local base_package=$(echo "$package" | sed 's/[=<>].*//' | awk '{print $1}')
    
    # چک کردن وجود فایل با اون اسم
    if ls | grep -i "^${base_package}-[0-9]" >/dev/null 2>&1; then
        echo "✅ Already exists: $base_package"
        return 0
    fi
    return 1
}

# تابع دانلود با قابلیت ادامه
download_with_resume() {
    local package=$1
    local base_package=$(echo "$package" | sed 's/[=<>].*//' | awk '{print $1}')
    
    # اگه پکیج از قبل هست، اسکیپ کن
    if package_exists "$base_package"; then
        return 0
    fi
    
    echo "⬇️  Downloading: $package"
    
    # تلاش با pip download
    if pip download \
        --no-deps \
        --dest . \
        --progress-bar on \
        --retries 5 \
        --timeout 30 \
        "$package" 2>/dev/null; then
        echo "   ✅ Done: $package"
        return 0
    else
        echo "   ⚠️  Failed: $package - ادامه می‌دهم..."
        return 1
    fi
}

# تابع دانلود دسته‌ای با ورژن مشخص
download_batch() {
    local file=$1
    local name=$(basename "$file")
    echo ""
    echo "📋 Processing $name..."
    
    while IFS= read -r line || [ -n "$line" ]; do
        # حذف کامنت و خط خالی
        [[ -z "$line" || "$line" =~ ^# || "$line" =~ ^--find-links || "$line" =~ ^--no-index ]] && continue
        
        # استخراج پکیج با ورژن مشخص (اگه هست)
        package=$(echo "$line" | awk '{print $1}')
        if [[ -n "$package" ]]; then
            download_with_resume "$package"
        fi
    done < "$file"
}

# گزارش پکیج‌های موجود
echo ""
echo "📊 Existing packages in wheels directory:"
total_existing=$(ls -1 *.whl 2>/dev/null | wc -l)
echo "   Total existing: $total_existing packages"
echo ""

# دانلود همه requirements
echo "🔄 Downloading core packages..."
download_batch "$REQUIREMENTS_DIR/core.txt"

echo ""
echo "🔄 Downloading ML-lite packages..."
download_batch "$REQUIREMENTS_DIR/ml-lite.txt"

echo ""
echo "🔄 Downloading NLP packages..."
download_batch "$REQUIREMENTS_DIR/nlp.txt"

echo ""
echo "🔄 Downloading TF packages..."
download_batch "$REQUIREMENTS_DIR/tf.txt"

# پکیج‌های اضافی که ممکنه جا افتاده باشن
EXTRA_PACKAGES=(
    "slowapi==0.1.9"
    "apscheduler==3.10.4"
    "prometheus-client==0.20.0"
    "nltk==3.9.1"
    "textblob==0.18.0"
    "boto3==1.34.128"
    "cryptography==42.0.8"
    "psutil==5.9.8"
    "aiofiles==23.2.1"
    "python-multipart==0.0.9"
)

echo ""
echo "🔄 Downloading extra packages..."
for package in "${EXTRA_PACKAGES[@]}"; do
    download_with_resume "$package"
done

# گزارش نهایی
echo ""
echo "================================================"
echo "📊 Download Statistics:"
total_files=$(ls -1 *.whl 2>/dev/null | wc -l)
total_size=$(du -sh . | cut -f1)
echo "   Total files: $total_files"
echo "   Total size:  $total_size"

# نمایش پکیج‌های تکراری (اگه هست)
duplicates=$(ls *.whl | cut -d'-' -f1 | sort | uniq -d)
if [[ -n "$duplicates" ]]; then
    echo ""
    echo "⚠️  Duplicate packages found:"
    for pkg in $duplicates; do
        echo "   - $pkg: $(ls ${pkg}-*.whl | xargs)"
    done
fi
echo "================================================"
echo "✅ Download completed!"