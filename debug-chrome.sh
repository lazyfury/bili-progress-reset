#!/usr/bin/env bash
# 启动一个「带远程调试」的独立 Chrome 配置，供 agent / CDP 使用。
# 不影响你日常的 Chrome 主配置（独立 user-data-dir）。
#
# 用法：
#   ./debug-chrome.sh               # 打开空白页
#   ./debug-chrome.sh <url>         # 打开指定页面
#
# 首次使用：在弹出的窗口里登录一次 B 站，之后 cookie 会保存在这个独立配置里。
# 关闭调试：直接关掉这个 Chrome 窗口即可。

set -euo pipefail

PORT="${CDP_PORT:-9222}"
PROFILE="${CDP_PROFILE:-$HOME/.bili-cdp-profile}"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-about:blank}"

mkdir -p "$PROFILE"

echo "Chrome : $CHROME"
echo "配置   : $PROFILE"
echo "CDP    : http://127.0.0.1:$PORT"
echo
echo "提示：若该配置已在运行，新命令只会新开标签页，调试端口可能未开启；"
echo "      请先完全退出该配置的 Chrome 再执行本脚本。"
echo

"$CHROME" \
  --user-data-dir="$PROFILE" \
  --remote-debugging-port="$PORT" \
  --remote-allow-origins='*' \
  --no-first-run \
  --no-default-browser-check \
  "$URL" >/dev/null 2>&1 &

sleep 2
if curl -s --max-time 3 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✅ CDP 已就绪：http://127.0.0.1:$PORT"
  curl -s "http://127.0.0.1:$PORT/json/version"
else
  echo "❌ 未检测到 CDP 端口，可能是该配置已在运行。请完全退出后重试。"
  exit 1
fi
