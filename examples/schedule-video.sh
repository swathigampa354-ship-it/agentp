#!/usr/bin/env bash
set -euo pipefail

: "${TAISLY_API_KEY:?Set TAISLY_API_KEY first}"

VIDEO_PATH="${1:?Usage: ./schedule-video.sh ./video.mp4 tiktok_account_ids \"Caption\" \"2026-06-14T09:00:00+07:00\"}"
ACCOUNTS="${2:?Pass comma-separated TikTok account ids}"
DESCRIPTION="${3:?Pass a caption/description}"
SCHEDULED_AT="${4:?Pass an ISO scheduled date}"

taisly posts:create \
  --video "$VIDEO_PATH" \
  --accounts "$ACCOUNTS" \
  --description "$DESCRIPTION" \
  --scheduled "$SCHEDULED_AT"
