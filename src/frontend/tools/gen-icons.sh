#!/usr/bin/env bash
# Regenerate the favicon / app-icon PNGs from the bold monogram
# (brand/logo-monogram-bold.svg — solid arch, E knocked out, survives 16px).
#
#   favicon-16.png / favicon-32.png  — browser tab, rounded Aubergine field
#   apple-touch-icon.png (180)       — iOS, full-bleed Aubergine (iOS masks it)
#   icon-192.png                     — PWA any-purpose, rounded Aubergine field
#   icon-512-maskable.png (512)      — PWA maskable, full-bleed + ~21% safe zone
#
# Requires Inkscape. Run from anywhere: bash src/frontend/tools/gen-icons.sh
set -euo pipefail

IMG_DIR="$(cd "$(dirname "$0")/../assets/img" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

AUBERGINE="#4A1D42"
MIST="#F7F1F7"
BOLD_PATH='M12 124 V56 A48 48 0 0 1 108 56 V124 Z M30 34 H86 V48 H44 V61 H74 V75 H44 V88 H88 V102 H30 Z'

# $1 out name  $2 px  $3 corner radius (512-space)  $4 padding (512-space)
render() {
  local name="$1" px="$2" rx="$3" pad="$4"
  local inner=$(( 512 - 2 * pad ))
  cat > "$TMP/$name.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="$rx" fill="$AUBERGINE"/>
  <svg x="$pad" y="$pad" width="$inner" height="$inner" viewBox="0 0 120 132" fill="$MIST" preserveAspectRatio="xMidYMid meet">
    <path fill-rule="evenodd" d="$BOLD_PATH"/>
  </svg>
</svg>
EOF
  inkscape "$TMP/$name.svg" --export-type=png --export-filename="$IMG_DIR/$name.png" \
    -w "$px" -h "$px" >/dev/null 2>&1
  echo "  $name.png (${px}px)"
}

echo "regenerating icons from bold monogram ->"
render favicon-16          16  104 104
render favicon-32          32  104 104
render apple-touch-icon   180    0  64
render icon-192           192   40 104
render icon-512-maskable  512    0 108
echo "done"
