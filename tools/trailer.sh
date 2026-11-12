#!/usr/bin/env bash
# Encodes the trailer frames from tools/trailer.mjs into public/making/trailer.mp4.
# Usage: tools/trailer.sh /tmp/trailer
# One file per scene (same size, frame rate and settings), joined without re-encoding, then the music:
# Bamboo Blitz by Tsorthan Grove (CC0, already in public/audio), faded in and out.
set -euo pipefail
IN=${1:-/tmp/trailer}
WORK=$IN/encoded
mkdir -p "$WORK"
: > "$WORK/list.txt"
scenes=("$IN"/[0-9]-*/)
last=$(( ${#scenes[@]} - 1 ))
for i in "${!scenes[@]}"; do
  dir=${scenes[$i]%/}
  name=$(basename "$dir")
  frames=$(ls "$dir"/*.jpg | wc -l)
  dur=$(echo "scale=3; $frames / 30" | bc)
  fade=""
  if [ "$i" -eq 0 ]; then fade=",fade=t=in:st=0:d=0.6"; fi
  if [ "$i" -eq "$last" ]; then fade=",fade=t=out:st=$(echo "$dur - 0.8" | bc):d=0.8"; fi
  ffmpeg -y -loglevel error -framerate 30 -i "$dir/%04d.jpg" -vf "format=yuv420p$fade" \
    -c:v libx264 -crf 22 -preset veryfast -pix_fmt yuv420p -r 30 "$WORK/$name.tmp.mp4"
  mv "$WORK/$name.tmp.mp4" "$WORK/$name.mp4"
  echo "file '$WORK/$name.mp4'" >> "$WORK/list.txt"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/list.txt" -c copy "$WORK/video.mp4"
total=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/video.mp4")
# The game's own explosion sound (CC0, public/audio/sfx) under the music where the dynamite goes off in scene 1
BOOM=${BOOM_MS:-1900}
ffmpeg -y -loglevel error -i "$WORK/video.mp4" -i public/audio/bamboo-blitz.mp3 -i public/audio/sfx/explosion.mp3 -map 0:v -c:v copy \
  -filter_complex "[1:a]afade=t=in:st=0:d=0.8,afade=t=out:st=$(echo "$total - 2" | bc):d=2,volume=0.8[m];[2:a]adelay=$BOOM|$BOOM,volume=0.9[b];[m][b]amix=inputs=2:duration=first:normalize=0[a]" \
  -map "[a]" -c:a aac -b:a 160k -shortest -movflags +faststart "$WORK/trailer-full.mp4"
# The page gets a lighter copy (the full one stays in the work folder)
ffmpeg -y -loglevel error -i "$WORK/trailer-full.mp4" -c:v libx264 -crf 29 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart public/making/trailer.tmp.mp4
mv public/making/trailer.tmp.mp4 public/making/trailer.mp4
ls -la public/making/trailer.mp4
