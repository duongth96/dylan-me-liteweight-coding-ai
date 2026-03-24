#!/bin/bash
set -e

/init-users.sh

IPEX_INIT_PATH="$(command -v ipex-llm-init 2>/dev/null || true)"
if [ -n "$IPEX_INIT_PATH" ] && [ -f "$IPEX_INIT_PATH" ]; then
  source "$IPEX_INIT_PATH" --gpu --device Arc >/dev/null 2>&1 || source "$IPEX_INIT_PATH" --gpu
fi

# Chạy ollama serve ở background
ollama serve &

# Chạy ttyd và ép buộc sử dụng bash với quyền ghi
# -W: Cho phép nhập liệu
# -p 7681: Cổng truy cập
exec ttyd -W -c $CRE_USER:$CRE_PASSWORD -a -s 3 -t titleFixed=/bin/sh -t rendererType=webgl -t disableLeaveAlert=true /autologin.sh
