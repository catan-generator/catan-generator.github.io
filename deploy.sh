#!/bin/bash
# Deploy to GitHub Pages with cache busting.
#
#   ./deploy.sh              # stamp, commit, push
#   ./deploy.sh --no-push    # stamp + commit only
#
# Stamps a build id (UTC timestamp) into:
#   - service-worker.js  CACHE_NAME  → old caches are swept on activate
#   - index.html         ?v=  query strings of style.css / *.js
# then commits and pushes main. Commit your feature changes first; this
# script only adds the "chore(deploy)" stamp commit on top.
set -euo pipefail
cd "$(dirname "$0")"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ Working tree has uncommitted changes — commit them first." >&2
  exit 1
fi

BUILD="$(date -u +%Y%m%d-%H%M%S)"

# service worker cache name: catan-gen-<anything>  →  catan-gen-<BUILD>
sed -i '' -E "s/(const CACHE_NAME = 'catan-gen-)[^']*(')/\1${BUILD}\2/" service-worker.js
# asset version params in index.html
sed -i '' -E "s/(href=\"style\.css\?v=)[^\"]*/\1${BUILD}/; s/(src=\"generator-core\.js\?v=)[^\"]*/\1${BUILD}/; s/(src=\"app\.js\?v=)[^\"]*/\1${BUILD}/" index.html

grep -q "catan-gen-${BUILD}" service-worker.js || { echo "✗ stamp failed (service-worker.js)" >&2; exit 1; }
grep -q "app.js?v=${BUILD}" index.html || { echo "✗ stamp failed (index.html)" >&2; exit 1; }

git add service-worker.js index.html
git commit -q -m "chore(deploy): cache ${BUILD}"
echo "✓ stamped build ${BUILD}"

if [ "${1:-}" != "--no-push" ]; then
  git push origin main
  echo "✓ pushed — GitHub Pages will publish in a minute or two"
fi
