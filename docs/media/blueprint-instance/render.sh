#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
PYTHON="/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13"

QUALITY="${1:-preview}"
OUT_DIR="${DIR}/out/${QUALITY}"

echo "==> Rendering OpenCard animation frames with quality: ${QUALITY}"
echo "==> Engine: Cycles Metal GPU"

"${BLENDER}" -b --factory-startup -P "${DIR}/build_scene.py" -- --quality "${QUALITY}"

echo "==> Encoding video to MP4..."
"${PYTHON}" -c "
import os
import glob
import imageio.v3 as iio

out_dir = '${OUT_DIR}'
mp4_path = os.path.join(out_dir, 'blueprint-instance.mp4')
png_files = sorted(glob.glob(os.path.join(out_dir, 'frame_*.png')))

if not png_files:
    print('No frame png files found!')
    exit(1)

print(f'Encoding {len(png_files)} frames into {mp4_path} at 24 fps...')
writer = iio.imopen(mp4_path, 'w', plugin='pyav' if False else 'ffmpeg')
for f in png_files:
    frame = iio.imread(f)
    writer.write(frame)
writer.close()
print('Video successfully written to:', mp4_path)
"

echo "==> Done. Video available at: ${OUT_DIR}/blueprint-instance.mp4"

