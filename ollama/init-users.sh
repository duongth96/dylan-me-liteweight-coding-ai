#!/bin/sh
set -e

if ! id "$WEBTTY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$WEBTTY_USER"
  echo "${WEBTTY_USER}:${WEBTTY_PASSWORD}" | chpasswd
fi
