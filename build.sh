#!/bin/bash
# Netlify 및 Cloudflare Pages 빌드 시 환경변수를 주입하기 위한 스크립트

echo "Generating assets/js/config.js with environment variables..."

# config.js 파일 생성
cat <<EOF > assets/js/config.js
window.FIREBASE_CONFIG = {
  apiKey: "${FIREBASE_API_KEY}",
  authDomain: "${FIREBASE_AUTH_DOMAIN}",
  projectId: "${FIREBASE_PROJECT_ID}",
  storageBucket: "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${FIREBASE_APP_ID}"
};
EOF

echo "assets/js/config.js generated successfully!"
