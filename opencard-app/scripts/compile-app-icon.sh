#!/bin/bash
# 把 Icon Composer 图标编译成 Assets.car。CI 里的 actool 会随机崩溃，所以编译结果提交进仓库；改了 OpenCard.icon 后重新运行本脚本。
set -euo pipefail
cd "$(dirname "$0")/../src-tauri/icons"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -R OpenCard.icon "$work/Icon.icon"
xcrun actool "$work/Icon.icon" --compile "$work" --output-format human-readable-text --notices --warnings \
  --output-partial-info-plist "$work/p.plist" --app-icon Icon --include-all-app-icons --accent-color AccentColor \
  --enable-on-demand-resources NO --development-region en --target-device mac --minimum-deployment-target 26.0 --platform macosx
cp "$work/Assets.car" Assets.car
