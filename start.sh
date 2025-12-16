#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Catan Generator başlatılıyor..."
echo "📍 Port: 3000"
echo "🌐 http://localhost:3000"
echo ""
python3 -m http.server 3000

