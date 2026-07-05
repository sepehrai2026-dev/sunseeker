#!/bin/bash

export PATH="/Users/sradjpoust/.nvm/versions/node/v22.23.1/bin:$PATH"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN in your environment}"
export CLOUDFLARE_ACCOUNT_ID="89faf73996d0845a99ce853341011924"

SITES_DIR="/Users/sradjpoust/Documents/Claude/Projects/Sunseeker/microsites/sites"
EXCLUDE="balmorallaw.com gizempilates.com liquidblock.io ndpventuresinc.com"

SUCCESS=0
FAIL=0
SKIP=0

for site_dir in "$SITES_DIR"/*/; do
  site=$(basename "$site_dir")

  if echo "$EXCLUDE" | grep -qw "$site"; then
    SKIP=$((SKIP + 1))
    continue
  fi

  dist="$site_dir/dist"
  if [ ! -f "$dist/index.html" ]; then
    SKIP=$((SKIP + 1))
    continue
  fi

  project=$(echo "$site" | tr '.' '-')

  # Check if already deployed by testing the pages.dev URL
  status=$(curl -s -o /dev/null -w "%{http_code}" "https://$project.pages.dev" 2>/dev/null)
  if [ "$status" = "200" ]; then
    echo "OK (already live): $site → https://$project.pages.dev"
    SUCCESS=$((SUCCESS + 1))
    continue
  fi

  echo "--- Deploying: $site ---"

  # Create project
  wrangler pages project create "$project" --production-branch=main 2>&1 | grep -v "wrangler" | grep -v "──" || true
  sleep 2

  # Deploy
  output=$(wrangler pages deploy "$dist" --project-name="$project" --branch=main --commit-dirty=true 2>&1)
  if echo "$output" | grep -q "Deployment complete"; then
    url=$(echo "$output" | grep -oP 'https://[^ ]+\.pages\.dev' | head -1)
    echo "  SUCCESS: $url"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "  FAIL: $(echo "$output" | tail -3)"
    FAIL=$((FAIL + 1))
  fi

  sleep 3
done

echo ""
echo "=== RESULTS ==="
echo "Success: $SUCCESS | Failed: $FAIL | Skipped: $SKIP"
