#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
src="$repo/parse-scorecard-index.ts"
host=${DEPLOY_HOST:-supabase}
if [ -f "$repo/.env.local" ]; then . "$repo/.env.local"; fi
: "${SUPABASE_URL:=${VITE_SUPABASE_URL:-https://supabase.muzoapps.com}}"
: "${SUPABASE_ANON_KEY:=${VITE_SUPABASE_ANON_KEY:?set VITE_SUPABASE_ANON_KEY}}"
export SUPABASE_URL SUPABASE_ANON_KEY
scp "$src" "$host:/tmp/parse-scorecard-index.ts"
ssh "$host" 'sudo cp /tmp/parse-scorecard-index.ts /opt/supabase/docker/volumes/functions/parse-scorecard/index.ts'
ssh "$host" 'cmp -s /tmp/parse-scorecard-index.ts /opt/supabase/docker/volumes/functions/parse-scorecard/index.ts'
ssh "$host" 'sudo docker restart supabase-edge-functions'
i=0
while [ "$i" -lt 10 ]; do
  if "$(dirname -- "$0")/warm-parse-scorecard.sh"; then exit 0; fi
  i=$((i+1)); sleep 2
done
echo "warm-up failed after 10 attempts" >&2
exit 1
