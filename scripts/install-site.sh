#!/bin/sh
set -eu
name=mini-golf
host=${DEPLOY_HOST:-root@2.25.249.238}
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
rsync -az --no-owner --no-group --chmod=F644 \
  "$repo/deploy/caddy/sites.d/$name.caddy" "$host:/srv/frontends/_caddy/sites.d/"
ssh "$host" 'sh -s' <<'REMOTE'
set -eu
docker exec supabase-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec supabase-caddy caddy reload --config /etc/caddy/Caddyfile --address 127.0.0.1:2019
REMOTE
echo "site installed: $name"
