#!/bin/bash

CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN in your environment}"
CF_ACCOUNT_ID="89faf73996d0845a99ce853341011924"

# CF Pages sites - add custom domains
CF_SITES="anonymize.com baystreetcrypto.com blockexchange.io blockmine.io blockmining.io btccanada.io btcchina.io btcrussia.io btcuk.io btcusa.io buytokens.io coolerthanourkids.com coolerthanourkids.io cryptoassetadvisors.com cryptocurrencyadvisers.com digitalassetreview.io endpointsecurity.io globalcryptoadvisers.com globalcryptoadvisors.com"

for site in $CF_SITES; do
  project=$(echo "$site" | tr '.' '-')
  echo "Adding custom domain $site to $project..."

  result=$(curl -s -X POST \
    "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects/$project/domains" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$site\"}" 2>&1)

  if echo "$result" | grep -q '"success":true'; then
    echo "  OK"
  else
    msg=$(echo "$result" | python3 -c 'import sys,json;d=json.load(sys.stdin);print([e.get("message","") for e in d.get("errors",[])])' 2>/dev/null || echo "$result")
    echo "  $msg"
  fi
done
