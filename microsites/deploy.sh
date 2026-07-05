#!/bin/bash
set -e

GH="/Users/sradjpoust/.local/bin/gh"
SITES_DIR="/Users/sradjpoust/Documents/Claude/Projects/Sunseeker/microsites/sites"
OWNER="sepehrai2026-dev"

EXCLUDE="balmorallaw.com gizempilates.com liquidblock.io ndpventuresinc.com"

SUCCESS=0
FAIL=0
SKIP=0

for site_dir in "$SITES_DIR"/*/; do
  site=$(basename "$site_dir")

  # Check exclusion list
  if echo "$EXCLUDE" | grep -qw "$site"; then
    echo "SKIP (excluded): $site"
    SKIP=$((SKIP + 1))
    continue
  fi

  dist="$site_dir/dist/index.html"
  if [ ! -f "$dist" ]; then
    echo "SKIP (no dist): $site"
    SKIP=$((SKIP + 1))
    continue
  fi

  echo "--- Deploying: $site ---"

  # Create a temp directory for the git repo
  tmp=$(mktemp -d)
  cp "$dist" "$tmp/index.html"

  cd "$tmp"
  git init -q
  git checkout -q -b main
  git add index.html
  git commit -q -m "Deploy $site"

  # Create GitHub repo (or skip if exists)
  if $GH repo view "$OWNER/$site" > /dev/null 2>&1; then
    echo "  Repo exists, pushing update..."
  else
    $GH repo create "$OWNER/$site" --public --description "Landing page for $site" 2>&1 || true
    sleep 1
  fi

  # Set remote and force push
  git remote add origin "https://github.com/$OWNER/$site.git" 2>/dev/null || git remote set-url origin "https://github.com/$OWNER/$site.git"
  if git push -f origin main 2>&1; then
    echo "  SUCCESS: $site"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "  FAIL: $site"
    FAIL=$((FAIL + 1))
  fi

  cd /
  rm -rf "$tmp"
done

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo "Success: $SUCCESS"
echo "Failed: $FAIL"
echo "Skipped: $SKIP"
