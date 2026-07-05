#!/bin/bash
set -e

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
    echo "SKIP (excluded): $site"
    SKIP=$((SKIP + 1))
    continue
  fi

  dist="$site_dir/dist"
  if [ ! -f "$dist/index.html" ]; then
    echo "SKIP (no dist): $site"
    SKIP=$((SKIP + 1))
    continue
  fi

  project=$(echo "$site" | tr '.' '-')
  echo "--- $site → $project.pages.dev ---"

  # Create project if it doesn't exist
  curl -s -X POST \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$project\",\"production_branch\":\"main\"}" > /dev/null 2>&1

  # Deploy
  if wrangler pages deploy "$dist" --project-name="$project" --branch=main --commit-dirty=true 2>&1 | grep -q "Deployment complete"; then
    echo "  SUCCESS"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "  FAIL"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "=== CLOUDFLARE PAGES DEPLOYMENT ==="
echo "Success: $SUCCESS"
echo "Failed: $FAIL"
echo "Skipped: $SKIP"
