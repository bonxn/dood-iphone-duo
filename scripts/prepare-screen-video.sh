#!/bin/sh
# Encodes a screen animation for the inner display.
#   sh scripts/prepare-screen-video.sh <source video> open    → public/screens/inner-open.{webm,mp4}  (plays while opening)
#   sh scripts/prepare-screen-video.sh <source video> close   → public/screens/inner-close.{webm,mp4} (plays while closing)
# Strips letterbox bars (e.g. a landscape UI inside a portrait phone recording), then scales and
# center-crops to 1780×1252 (the inner display's 890×626 frame at 2x), 30fps, no audio, and writes
# WebM (VP9, plays in headless Chromium for capture) plus an H.264 MP4 fallback.
set -eu
src="${1:?usage: prepare-screen-video.sh <source video> <open|close>}"
kind="${2:?usage: prepare-screen-video.sh <source video> <open|close>}"
case "$kind" in open|close) ;; *) echo "second argument must be 'open' or 'close'" >&2; exit 1 ;; esac
base="public/screens/inner-$kind"
# Most frequent cropdetect result over the first 120 frames; falls back to no pre-crop.
bars=$(ffmpeg -v info -i "$src" -vf "cropdetect=limit=24:round=2:reset=0" -frames:v 120 -f null - 2>&1 | grep -o 'crop=[0-9:]*' | sort | uniq -c | sort -rn | head -1 | grep -o 'crop=[0-9:]*' || true)
[ -n "$bars" ] && echo "letterbox: $bars" && bars="$bars,"
filter="${bars}scale=1780:1252:force_original_aspect_ratio=increase:flags=lanczos,crop=1780:1252,setsar=1,fps=30"
# Keyframe every 15 frames and cues up front so restarting from 0 (and frame-accurate seeking during capture) is instant.
ffmpeg -y -loglevel error -i "$src" -vf "$filter" -an -c:v libvpx-vp9 -b:v 0 -crf 30 -row-mt 1 -g 15 -keyint_min 15 -pix_fmt yuv420p -cues_to_front 1 "$base.webm"
ffmpeg -y -loglevel error -i "$src" -vf "$filter" -an -c:v libx264 -crf 18 -g 15 -keyint_min 15 -pix_fmt yuv420p -movflags +faststart "$base.mp4"
echo "wrote $base.webm and $base.mp4"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$base.webm"
