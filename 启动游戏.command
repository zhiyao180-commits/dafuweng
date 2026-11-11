#!/bin/bash
# Mac：双击运行
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "还没有安装 Node.js，请先到 https://nodejs.org 下载安装 LTS 版本，然后再双击本文件。"
  open "https://nodejs.org"; read -p "按回车关闭"; exit 1
fi
[ -d node_modules ] || npm install --omit=dev
(sleep 2; open "http://localhost:3000") &
npm start
