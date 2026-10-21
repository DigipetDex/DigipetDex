#!/data/data/com.termux/files/usr/bin/bash
# Termux(루팅 기기)에서 로거를 24시간 상시 실행하도록 설치한다.
# 사용: 이 파일이 있는 폴더에서  bash termux-setup.sh
# 필요: F-Droid판 Termux + Termux:Boot (같은 출처에서 설치), Magisk 루팅
set -e
cd "$(dirname "$0")"

echo '[1/5] Node.js 설치'
pkg update -y
pkg install -y nodejs-lts

echo '[2/5] 의존성 설치'
npm ci --omit=dev
npm i -g pm2

echo '[3/5] 절전 예외 (Doze 화이트리스트, 루트 필요)'
termux-wake-lock || true
su -c 'dumpsys deviceidle whitelist +com.termux' || echo '루트 권한을 허용해야 함 (Magisk 팝업 확인)'
su -c 'dumpsys deviceidle whitelist +com.termux.boot' || true

echo '[4/5] 로거 실행'
pm2 delete digipet-logger >/dev/null 2>&1 || true
pm2 start index.js --name digipet-logger
pm2 save

echo '[5/5] 부팅 시 자동 시작 (Termux:Boot)'
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
su -c 'dumpsys deviceidle whitelist +com.termux' >/dev/null 2>&1
su -c 'dumpsys deviceidle whitelist +com.termux.boot' >/dev/null 2>&1
pm2 resurrect
EOF
chmod +x ~/.termux/boot/start.sh

echo
echo '완료. 상태 확인: pm2 logs digipet-logger'
echo 'Termux:Boot 앱을 한 번 열어줘야 부팅 자동 시작이 활성화됨.'
