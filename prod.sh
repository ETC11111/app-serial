#!/bin/bash

# 프로덕션 배포 스크립트
# React 앱 빌드 후 정적 파일을 웹 서버 디렉토리로 배포

set -e  # 에러 발생 시 스크립트 중단

echo "🚀 프로덕션 배포 시작..."

# sudo 세션 갱신 (비밀번호를 한 번만 입력하도록)
echo "🔑 관리자 권한 확인 중..."
sudo -v

# sudo 세션 유지 (백그라운드에서 주기적으로 갱신)
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

echo "✅ 권한 확인 완료"

# 1) 기존 정적 파일 삭제
echo "📦 기존 정적 파일 삭제 중..."
sudo rm -rf /var/www/html/*

# 2) dist 폴더의 내용을 /var/www/html로 복사
echo "📋 빌드된 파일 복사 중..."
sudo cp -r dist/* /var/www/html/

# 3) 권한 정리 (Nginx/Apache 기본 계정 www-data 기준)
echo "🔐 파일 권한 설정 중..."
sudo chown -R www-data:www-data /var/www/html

# 디렉토리 권한 755
sudo find /var/www/html -type d -exec chmod 755 {} \;

# 파일 권한 644
sudo find /var/www/html -type f -exec chmod 644 {} \;

echo "✅ 프로덕션 배포 완료!"
echo "📁 배포 위치: /var/www/html"

