#!/usr/bin/env bash
# Pull a screenshot off the tablet. This is the main feedback loop while building
# the frame UI - no need to walk over and look at it.
set -euo pipefail
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
OUT="${1:-/tmp/frame.png}"
adb exec-out screencap -p > "$OUT"
echo "$OUT"
