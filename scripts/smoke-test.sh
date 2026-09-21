#!/usr/bin/env bash
# Post-deploy smoke test.
#
#   ./scripts/smoke-test.sh https://your-service.up.railway.app
#
# Checks the things that actually broke when the four portals were separate:
# health, one sign-in for every role, and that no role can reach another's data.
# Read-only except for the sign-ins. Safe to run against production.
set -u
BASE="${1:-http://127.0.0.1:8788}"
PASS=0; FAIL=0

say()  { printf "%-58s %s\n" "$1" "$2"; }
ok()   { PASS=$((PASS+1)); say "$1" "PASS"; }
bad()  { FAIL=$((FAIL+1)); say "$1" "FAIL  ($2)"; }

code() { curl -s --max-time 25 -o /dev/null -w '%{http_code}' "$@"; }

token_for() {
  curl -s --max-time 25 -X POST "$BASE/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null
}

echo "Fly Masters platform smoke test -> $BASE"
echo

# ---- 1. the service is up and the database is reachable -------------------
H=$(curl -s --max-time 25 "$BASE/api/health")
echo "$H" | grep -q '"ok":true' && ok "health endpoint" || bad "health endpoint" "$H"

# ---- 2. the SPA is being served -------------------------------------------
C=$(code "$BASE/")
[ "$C" = "200" ] && ok "student portal responds" || bad "student portal responds" "$C"
C=$(code "$BASE/staff")
[ "$C" = "200" ] && ok "staff sign-in door responds" || bad "staff sign-in door responds" "$C"
for p in admin counselor telecaller; do
  C=$(code "$BASE/$p")
  [ "$C" = "200" ] && ok "/$p responds" || bad "/$p responds" "$C"
done

# ---- 3. unauthenticated calls are refused ---------------------------------
C=$(code "$BASE/api/state")
[ "$C" = "401" ] && ok "no token is rejected (401)" || bad "no token is rejected" "got $C"

C=$(code "$BASE/api/state" -H "Authorization: Bearer not-a-real-token")
[ "$C" = "401" ] && ok "forged token is rejected (401)" || bad "forged token is rejected" "got $C"

# ---- 4. one sign-in for every role, and role isolation --------------------
# Set these to real accounts before running. Leave blank to skip.
ADMIN_EMAIL="${ADMIN_EMAIL:-}";           ADMIN_PASS="${ADMIN_PASS:-}"
COUNSELOR_EMAIL="${COUNSELOR_EMAIL:-}";   COUNSELOR_PASS="${COUNSELOR_PASS:-}"
TELECALLER_EMAIL="${TELECALLER_EMAIL:-}"; TELECALLER_PASS="${TELECALLER_PASS:-}"

check_role() {
  local label="$1" email="$2" pass="$3" own="$4"
  [ -z "$email" ] && { say "$label sign-in" "SKIP (set ${5}_EMAIL/${5}_PASS)"; return; }
  local t; t=$(token_for "$email" "$pass")
  if [ -z "$t" ]; then bad "$label sign-in" "no token returned"; return; fi
  ok "$label sign-in"

  [ "$(code "$BASE/api/me" -H "Authorization: Bearer $t")" = "200" ] \
    && ok "$label /api/me" || bad "$label /api/me" "not 200"

  [ "$(code "$BASE$own" -H "Authorization: Bearer $t")" = "200" ] \
    && ok "$label reaches own routes" || bad "$label reaches own routes" "$own not 200"

  for other in /api/state /api/counselor/state /api/telecaller/state; do
    [ "$other" = "$own" ] && continue
    local c; c=$(code "$BASE$other" -H "Authorization: Bearer $t")
    [ "$c" = "403" ] \
      && ok "$label blocked from $other" \
      || bad "$label blocked from $other" "expected 403, got $c"
  done
}

check_role "admin"      "$ADMIN_EMAIL"      "$ADMIN_PASS"      "/api/state"            "ADMIN"
check_role "counselor"  "$COUNSELOR_EMAIL"  "$COUNSELOR_PASS"  "/api/counselor/state"  "COUNSELOR"
check_role "telecaller" "$TELECALLER_EMAIL" "$TELECALLER_PASS" "/api/telecaller/state" "TELECALLER"

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
