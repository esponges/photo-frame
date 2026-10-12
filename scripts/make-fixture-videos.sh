#!/usr/bin/env bash
# Generates test clips for fixture mode into backend/.fixtures/.
#   h264.mp4 - must play muted and advance (task 8.12)
#   hevc.mp4 - the Nexus 7 cannot decode it; must be skipped, not shown black (8.13)
set -euo pipefail
out="$(dirname "$0")/../backend/.fixtures"
mkdir -p "$out"

src="testsrc2=size=1280x720:rate=30:duration=5"
ffmpeg -y -loglevel error -f lavfi -i "$src" -pix_fmt yuv420p \
  -c:v libx264 -profile:v baseline -level 3.1 -movflags +faststart "$out/h264.mp4"
ffmpeg -y -loglevel error -f lavfi -i "$src" -pix_fmt yuv420p \
  -c:v libx265 -tag:v hvc1 -movflags +faststart "$out/hevc.mp4"
ls -l "$out"
