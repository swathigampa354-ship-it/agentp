#!/usr/bin/env bash
set -euo pipefail

: "${TAISLY_API_KEY:?Set TAISLY_API_KEY first}"

VIDEO_PATH="${1:?Usage: ./post-video.sh ./video.mp4 tiktok_platform_id_1,tiktok_platform_id_2 \"Caption\"}"
PLATFORMS="${2:?Pass comma-separated TikTok platform ids}"
DESCRIPTION="${3:?Pass a caption/description}"

taisly posts:create \
  --video "$VIDEO_PATH" \
  --platforms "$PLATFORMS" \
  --description "$DESCRIPTION"
