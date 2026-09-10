#!/bin/sh
# Builds stand-in inner-screen animations from the still design so the video pipeline can be
# exercised before the real clips exist:
#   open  — the UI fades in and settles upward over ~1s, then holds (3s)
#   close — the UI slides down and fades out over ~1s, then holds blank (3s)
# Writes public/screens/raw/inner-open-placeholder.mp4 and inner-close-placeholder.mp4.
set -eu
size=1780x1252
ffmpeg -y -loglevel error -f lavfi -i "color=c=0xF5F5F5:s=$size:r=30:d=3" -loop 1 -t 3 -i public/screens/inner.png \
  -filter_complex "[1]format=rgba,fade=t=in:st=0:d=0.9:alpha=1[ui];[0][ui]overlay=x=0:y='90*pow(1-min(t/1.1\,1)\,2)':shortest=1,format=yuv420p" \
  -c:v libx264 -crf 18 -movflags +faststart public/screens/raw/inner-open-placeholder.mp4
ffmpeg -y -loglevel error -f lavfi -i "color=c=0xF5F5F5:s=$size:r=30:d=3" -loop 1 -t 3 -i public/screens/inner.png \
  -filter_complex "[1]format=rgba,fade=t=out:st=0.2:d=0.9:alpha=1[ui];[0][ui]overlay=x=0:y='90*pow(min(t/1.1\,1)\,2)':shortest=1,format=yuv420p" \
  -c:v libx264 -crf 18 -movflags +faststart public/screens/raw/inner-close-placeholder.mp4
echo "wrote public/screens/raw/inner-open-placeholder.mp4 and inner-close-placeholder.mp4"
