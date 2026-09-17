#!/usr/bin/env bash
#
# check-type-sync.sh — the UI's mirror of the API's types.
#
# The UI mirrors the API's shared types but cannot use them verbatim:
#   - Deno `.ts` import extensions vs the UI's extensionless imports.
#   - The UI omits server-only deps (a2a_types, SQLToolConfig, agent-client) and
#     subsets several files (e.g. status_types keeps only the stored shapes).
#   - A handful of fields genuinely diverge, each tagged `// @ui-divergence`.
#
# So a re-sync is: paste the API file over the UI one, fix imports/prune, then
# re-apply the tagged divergences. This script lists those divergences and shows
# a comment/format-normalized diff per file so drift is easy to spot.
#
# F29: it is also the CI gate. With --strict it fails when
#   - src/supabase/db_types.ts differs from the API's _shared/db_types.ts, or
#   - the normalized diffs differ from scripts/type-sync.baseline, the
#     committed record of accepted divergences and subsets.
# A new API field the UI lacks, or a UI change the API lacks, turns CI red.
# When the divergence is intended, record it: --update-baseline, and review
# the baseline diff in the pull request.
#
# Usage:  scripts/check-type-sync.sh [--strict | --update-baseline]
# Env:    API_REPO_DIR   the API repository (default: ../backend or
#                        ../open-bsp-api, whichever exists)
#         API_TYPES_DIR, API_DB_TYPES, UI_TYPES_DIR, UI_DB_TYPES,
#         TYPE_SYNC_BASELINE  override single paths (tests)

set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-report}"

if [ -z "${API_REPO_DIR:-}" ]; then
  for candidate in ../backend ../open-bsp-api; do
    if [ -d "$candidate/supabase/functions/_shared/types" ]; then
      API_REPO_DIR="$candidate"
      break
    fi
  done
fi
API_REPO_DIR="${API_REPO_DIR:-../open-bsp-api}"

UI_DIR="${UI_TYPES_DIR:-src/supabase/types}"
UI_DB="${UI_DB_TYPES:-src/supabase/db_types.ts}"
API_DIR="${API_TYPES_DIR:-$API_REPO_DIR/supabase/functions/_shared/types}"
API_DB="${API_DB_TYPES:-$API_REPO_DIR/supabase/functions/_shared/db_types.ts}"
BASELINE="${TYPE_SYNC_BASELINE:-scripts/type-sync.baseline}"

# UI files that subset their API counterpart (API-only blocks are expected).
SUBSET_FILES=" status_types whatsapp_webhook_message_types whatsapp_endpoint_types whatsapp_webhook_payload_types instagram_webhook_payload_types "
# UI files with no API counterpart (skip the diff).
UI_ONLY_FILES=" ui_types database_types "

echo "==> UI divergences to re-apply after a paste (grep @ui-divergence:):"
grep -rn "@ui-divergence:" "$UI_DIR" || echo "  (none found)"
echo

if [ ! -d "$API_DIR" ]; then
  echo "!! API types dir not found: $API_DIR"
  echo "   Set API_REPO_DIR to the open-bsp-api checkout and re-run."
  [ "$MODE" = "report" ] && exit 0
  exit 1
fi

# Declarations only: comments, formatting (deno fmt vs prettier) and `.ts`
# import extensions do not count (scripts/normalize-types.mjs).
normalize() {
  node scripts/normalize-types.mjs "$1"
}

# The normalized diffs, in a stable form: one section per differing file.
current_diffs() {
  for ui in "$UI_DIR"/*.ts; do
    base="$(basename "$ui" .ts)"
    case "$UI_ONLY_FILES" in *" $base "*) continue ;; esac
    api="$API_DIR/$base.ts"
    if [ ! -f "$api" ]; then
      echo "## $base: no API counterpart"
      continue
    fi
    if ! out="$(diff <(normalize "$api") <(normalize "$ui"))"; then
      echo "## $base"
      echo "$out"
    fi
  done
}

diffs="$(current_diffs)"

echo "==> Normalized diffs (< API only, > UI only):"
if [ -z "$diffs" ]; then
  echo "  (none)"
else
  echo "$diffs" | sed 's/^/       /'
fi
echo

if [ "$MODE" = "--update-baseline" ]; then
  printf '%s' "$diffs" > "$BASELINE"
  echo "==> Baseline written to $BASELINE"
  exit 0
fi

[ "$MODE" = "report" ] && exit 0

status=0

if ! cmp -s "$API_DB" "$UI_DB"; then
  echo "!! db_types.ts differs from the API's: copy $API_DB over $UI_DB"
  diff "$API_DB" "$UI_DB" | head -40 || true
  status=1
fi

if [ "$diffs" != "$(cat "$BASELINE" 2>/dev/null)" ]; then
  echo "!! The mirrored types drifted from the accepted baseline ($BASELINE)."
  echo "   Sync the UI types (or the API's), or, if the divergence is intended,"
  echo "   run scripts/check-type-sync.sh --update-baseline and commit it."
  echo "   Baseline vs now:"
  diff <(cat "$BASELINE" 2>/dev/null) <(echo -n "$diffs") | sed 's/^/     /' || true
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "==> types in sync (db_types.ts identical; divergences match the baseline)"
fi

exit "$status"
