#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  ACCESSIA Pro — Build macOS
#  Produit une seule application :
#    · ACCESSIA Pro.app — Swift menu bar, runtime natif intégré
# ═══════════════════════════════════════════════════════════
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ROOT="$(cd "${ROOT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist/macos"

APP_NAME="ACCESSIA Pro"
APP_BUNDLE="${DIST_DIR}/${APP_NAME}.app"

APP_VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' \
  "${ROOT_DIR}/frontend/package.json" | head -n 1)"
BUILD_REVISION="$(date -u '+%Y%m%d%H%M%S')"

PAYLOAD_ITEMS=(
  "CRM"
  "01_COMMERCIAL"
  "02_COMPTABILITE"
  "03_JURIDIQUE"
  "04_MARKETING"
  "05_PROJETS"
  "06_FORMATION"
  "07_ADMINISTRATIF"
  "_ACCESSIA_APP"
)

log() { printf '[build] %s\n' "$*"; }

# ── Répertoires ──────────────────────────────────────────────────
prepare_dirs() {
  rm -rf "${DIST_DIR}"
  mkdir -p \
    "${APP_BUNDLE}/Contents/MacOS" \
    "${APP_BUNDLE}/Contents/Resources/runtime-native"
}

# ── Exécutable Swift ────────────────────────────────────────────
compile_launcher() {
  local out="${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"
  local src="${ROOT_DIR}/macos/swift/AccessiaApp.swift"

  if ! command -v swiftc >/dev/null 2>&1; then
    log "ERREUR : swiftc introuvable — installez Xcode Command Line Tools"
    exit 1
  fi

  log "Compilation Swift…"
  swiftc -framework AppKit -framework WebKit -framework Foundation \
    "${src}" \
    -o "${out}" \
    -target arm64-apple-macosx12.0 \
    2>&1 | sed 's/^/  [swiftc] /'
  chmod +x "${out}"
  log "Exécutable : MacOS/${APP_NAME}"
}

# ── Scripts runtime ─────────────────────────────────────────────
copy_runtime() {
  local res="${APP_BUNDLE}/Contents/Resources/runtime-native"
  cp "${ROOT_DIR}/macos/runtime-native/common.sh"  "${res}/common.sh"
  cp "${ROOT_DIR}/macos/runtime-native/launch.sh"  "${res}/launch.sh"
  cp "${ROOT_DIR}/macos/runtime-native/stop.sh"    "${res}/stop.sh"
  chmod +x "${res}/common.sh" "${res}/launch.sh" "${res}/stop.sh"
}

# ── Info.plist ──────────────────────────────────────────────────
write_plist() {
  cat > "${APP_BUNDLE}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>   <string>fr</string>
  <key>CFBundleDisplayName</key>         <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>          <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>          <string>com.accessia.pro</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key>                <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>         <string>APPL</string>
  <key>CFBundleShortVersionString</key>  <string>${APP_VERSION}</string>
  <key>CFBundleVersion</key>             <string>${APP_VERSION}</string>
  <key>LSMinimumSystemVersion</key>      <string>12.0</string>
  <key>NSHighResolutionCapable</key>     <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>   <true/>
  </dict>
</dict>
</plist>
EOF
}

# ── Icône ────────────────────────────────────────────────────────
build_icon() {
  local icon_src=""
  [ -f "${ROOT_DIR}/frontend/public/logo.jpg" ]    && icon_src="${ROOT_DIR}/frontend/public/logo.jpg"
  [ -f "${ROOT_DIR}/frontend/public/favicon.png" ] && icon_src="${ROOT_DIR}/frontend/public/favicon.png"
  { [ -z "${icon_src}" ] || ! command -v sips >/dev/null 2>&1 \
    || ! command -v iconutil >/dev/null 2>&1; } && return 0

  local tmp iconset png
  tmp="$(mktemp -d)"
  iconset="${tmp}/Accessia.iconset"
  png="${tmp}/icon.png"
  mkdir -p "${iconset}"

  sips -s format png "${icon_src}" --out "${png}" >/dev/null 2>&1 || { rm -rf "${tmp}"; return 0; }
  sips -z 16  16  "${png}" --out "${iconset}/icon_16x16.png"      >/dev/null 2>&1 || true
  sips -z 32  32  "${png}" --out "${iconset}/icon_16x16@2x.png"   >/dev/null 2>&1 || true
  sips -z 32  32  "${png}" --out "${iconset}/icon_32x32.png"       >/dev/null 2>&1 || true
  sips -z 64  64  "${png}" --out "${iconset}/icon_32x32@2x.png"   >/dev/null 2>&1 || true
  sips -z 128 128 "${png}" --out "${iconset}/icon_128x128.png"    >/dev/null 2>&1 || true
  sips -z 256 256 "${png}" --out "${iconset}/icon_128x128@2x.png" >/dev/null 2>&1 || true
  sips -z 256 256 "${png}" --out "${iconset}/icon_256x256.png"    >/dev/null 2>&1 || true
  sips -z 512 512 "${png}" --out "${iconset}/icon_256x256@2x.png" >/dev/null 2>&1 || true
  sips -z 512 512 "${png}" --out "${iconset}/icon_512x512.png"    >/dev/null 2>&1 || true
  cp "${png}" "${iconset}/icon_512x512@2x.png"

  local icns="${APP_BUNDLE}/Contents/Resources/accessia.icns"
  iconutil -c icns "${iconset}" -o "${icns}" >/dev/null 2>&1 || true
  if [ -f "${icns}" ]; then
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string accessia.icns" \
      "${APP_BUNDLE}/Contents/Info.plist" >/dev/null 2>&1 || true
  fi
  rm -rf "${tmp}"
}

# ── Pre-build frontend ──────────────────────────────────────────
prebuild_frontend() {
  local frontend_dir="${ROOT_DIR}/frontend"

  if ! command -v node >/dev/null 2>&1; then
    log "Node.js introuvable — le frontend sera buildé au premier lancement"
    return 0
  fi
  if ! command -v npm >/dev/null 2>&1; then
    log "npm introuvable — le frontend sera buildé au premier lancement"
    return 0
  fi

  log "Pre-build du frontend Next.js (embarqué dans le payload)…"

  # Install deps si nécessaire
  if [ ! -d "${frontend_dir}/node_modules" ]; then
    log "  Installation des dépendances npm…"
    (cd "${frontend_dir}" && npm install --legacy-peer-deps -q 2>/dev/null)
  fi

  # Build standalone
  (cd "${frontend_dir}" && \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=http://localhost:8001 \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096" \
    npm run build 2>&1 | tail -5) || {
    log "  Build échoué — le frontend sera buildé au premier lancement"
    return 0
  }

  # Copier les assets dans standalone
  local standalone_dir="${frontend_dir}/.next/standalone"
  if [ -d "${standalone_dir}" ]; then
    rsync -a --delete "${frontend_dir}/.next/static/" "${standalone_dir}/.next/static/" 2>/dev/null || true
    rsync -a --delete "${frontend_dir}/public/" "${standalone_dir}/public/" 2>/dev/null || true
    # Stamp pour détecter le pre-build au runtime
    local stamp="${standalone_dir}/.prebuild-stamp"
    printf '%s' "$(date -u +%s)" > "${stamp}"
    log "Frontend buildé et prêt à embarquer"
  fi
}

# ── Payload (code source + données) ─────────────────────────────
copy_payload() {
  local payload_root="${APP_BUNDLE}/Contents/Resources/payload/root"
  mkdir -p "${payload_root}"

  log "Copie du payload…"
  for item in "${PAYLOAD_ITEMS[@]}"; do
    local src="${PROJECT_ROOT}/${item}"
    local dest="${payload_root}/${item}"
    [ ! -e "${src}" ] && { log "  ignoré (absent) : ${item}"; continue; }

    if [ -d "${src}" ]; then
      mkdir -p "${dest}"
      if [ "${item}" = "CRM" ]; then
        rsync -a --delete \
          --exclude '.env' --exclude '.DS_Store' \
          --exclude 'backend/venv' \
          --exclude 'frontend/node_modules' \
          --exclude 'frontend/.next/cache' \
          --exclude 'dist' \
          "${src}/" "${dest}/"
      else
        rsync -a --exclude '.DS_Store' "${src}/" "${dest}/"
      fi
    else
      cp "${src}" "${dest}"
    fi
  done

  printf '%s\n' "${APP_VERSION}" > "${APP_BUNDLE}/Contents/Resources/payload/version.txt"
  printf '%s\n' "${BUILD_REVISION}" > "${APP_BUNDLE}/Contents/Resources/payload/revision.txt"
}

# ── Signature ad-hoc ─────────────────────────────────────────────
sign() {
  command -v codesign >/dev/null 2>&1 || return 0
  codesign --force --deep --sign - "${APP_BUNDLE}" >/dev/null 2>&1 || true
}

# ── DMG ──────────────────────────────────────────────────────────
build_dmg() {
  local staging="${DIST_DIR}/dmg"
  local dmg="${DIST_DIR}/${APP_NAME}.dmg"
  local zip="${DIST_DIR}/${APP_NAME}.zip"

  mkdir -p "${staging}"
  cp -R "${APP_BUNDLE}" "${staging}/${APP_NAME}.app"
  ln -sf /Applications "${staging}/Applications"

  cat > "${staging}/LISEZ-MOI.txt" <<'EOF'
ACCESSIA Pro

Double-cliquez sur ACCESSIA Pro.app et glissez-le dans Applications.

Premier lancement : installation automatique (~5-10 min selon votre connexion).
Lancements suivants : quasi-instantané.

L'application apparaît dans la barre de menus (pas dans le Dock).
EOF

  if command -v ditto >/dev/null 2>&1; then
    ditto -c -k --sequesterRsrc --keepParent "${staging}" "${zip}" >/dev/null 2>&1 || true
    log "ZIP : ${zip}"
  fi

  if command -v hdiutil >/dev/null 2>&1; then
    hdiutil create -volname "${APP_NAME}" -srcfolder "${staging}" \
      -ov -format UDZO "${dmg}" >/dev/null 2>&1 \
      && log "DMG : ${dmg}" \
      || log "DMG ignoré (ZIP disponible)"
  fi

  rm -rf "${staging}"
}

# ── Main ─────────────────────────────────────────────────────────
main() {
  [ -n "${APP_VERSION}" ] || { log "Impossible de lire la version"; exit 1; }
  log "Version ${APP_VERSION} (rev ${BUILD_REVISION})"

  prepare_dirs
  compile_launcher
  copy_runtime
  write_plist
  build_icon
  prebuild_frontend
  copy_payload
  sign
  build_dmg

  log "─────────────────────────────────────────"
  log "App    : ${APP_BUNDLE}"
  log "DMG    : ${DIST_DIR}/${APP_NAME}.dmg"
  log "Terminé."
}

main "$@"
