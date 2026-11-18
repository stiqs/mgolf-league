#!/bin/sh
set -eu
: "${SUPABASE_URL:=https://supabase.muzoapps.com}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
warm() {
  curl -sS -f --max-time 60 -o /dev/null -w 'warm-up: %{http_code} %{time_total}s\n' \
    -X POST "$SUPABASE_URL/functions/v1/parse-scorecard" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"image":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAf/Z","teams":[]}'
}
warm || { echo "first attempt failed; retrying"; sleep 2; warm; }
