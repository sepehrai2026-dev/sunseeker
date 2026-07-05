#!/bin/bash

GH="/Users/sradjpoust/.local/bin/gh"
SITES_DIR="/Users/sradjpoust/Documents/Claude/Projects/Sunseeker/microsites/sites"
EXCLUDE="balmorallaw.com gizempilates.com liquidblock.io ndpventuresinc.com"

# Sites already on CF Pages (skip these)
CF_LIVE="anonymize.com baystreetcrypto.com blockexchange.io blockmine.io blockmining.io btccanada.io btcchina.io btcrussia.io btcuk.io btcusa.io buytokens.io coolerthanourkids.com coolerthanourkids.io cryptoassetadvisors.com cryptocurrencyadvisers.com digitalassetreview.io endpointsecurity.io globalcryptoadvisers.com globalcryptoadvisors.com"

SUCCESS=0
FAIL=0
SKIP=0

for site_dir in "$SITES_DIR"/*/; do
  site=$(basename "$site_dir")

  if echo "$EXCLUDE" | grep -qw "$site"; then
    SKIP=$((SKIP + 1))
    continue
  fi

  if echo "$CF_LIVE" | grep -qw "$site"; then
    SKIP=$((SKIP + 1))
    continue
  fi

  dist="$site_dir/dist/index.html"
  if [ ! -f "$dist" ]; then
    SKIP=$((SKIP + 1))
    continue
  fi

  echo "--- GitHub Pages: $site ---"

  # Enable GitHub Pages on the repo (source: main branch, root)
  $GH api -X POST "repos/sepehrai2026-dev/$site/pages" \
    --field "source[branch]=main" \
    --field "source[path]=/" \
    > /dev/null 2>&1

  # If already enabled, update it
  if [ $? -ne 0 ]; then
    $GH api -X PUT "repos/sepehrai2026-dev/$site/pages" \
      --field "source[branch]=main" \
      --field "source[path]=/" \
      > /dev/null 2>&1
  fi

  # Check if it worked
  pages_url=$($GH api "repos/sepehrai2026-dev/$site/pages" --jq '.html_url' 2>/dev/null)
  if [ -n "$pages_url" ]; then
    echo "  SUCCESS: $pages_url"

    # Set custom domain (CNAME)
    $GH api -X PUT "repos/sepehrai2026-dev/$site/pages" \
      --field "cname=$site" \
      --field "source[branch]=main" \
      --field "source[path]=/" \
      > /dev/null 2>&1 && echo "  Custom domain: $site" || true

    SUCCESS=$((SUCCESS + 1))
  else
    echo "  FAIL"
    FAIL=$((FAIL + 1))
  fi

  sleep 1
done

echo ""
echo "=== GITHUB PAGES DEPLOYMENT ==="
echo "Success: $SUCCESS | Failed: $FAIL | Skipped: $SKIP"
