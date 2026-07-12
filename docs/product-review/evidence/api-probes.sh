#!/bin/bash
# api-probes.sh — scripted black-box probe matrix against the running API (:8080).
# Each probe prints PROBE <name>: <result> so the report can quote it verbatim.
B=http://localhost:8080/api
J='content-type: application/json'
CJ=/tmp/probe-cookies.txt
rm -f $CJ

p() { echo "PROBE $1: $2"; }

# --- health & error shape ---
p healthz "$(curl -s -o /dev/null -w '%{http_code}' $B/healthz)"
p unknown-route "$(curl -s -o /dev/null -w '%{http_code}' $B/definitely-not-a-route)"
p error-shape "$(curl -s $B/players/999999 -H 'x-tenant-id: 1' | head -c 120)"

# --- security headers (helmet) ---
curl -s -D - -o /dev/null $B/tenant-brand -H 'x-tenant-id: 1' | grep -iE 'strict-transport|x-content-type|x-frame|content-security' | sed 's/^/HEADER /'

# --- auth: happy/sad ---
p login-wrong-pass "$(curl -s -X POST $B/auth/login -H "$J" -H 'x-tenant-id: 1' -d '{"username":"owner","password":"nope"}' -o /dev/null -w '%{http_code}')"
p login-ok "$(curl -s -c $CJ -X POST $B/auth/login -H "$J" -H 'x-tenant-id: 1' -d '{"username":"owner","password":"ReviewAdmin!2026"}' -o /dev/null -w '%{http_code}')"
p me-with-session "$(curl -s -b $CJ $B/auth/me -H 'x-tenant-id: 1' -o /dev/null -w '%{http_code}')"
p me-without-session "$(curl -s $B/auth/me -H 'x-tenant-id: 1' -o /dev/null -w '%{http_code}')"
# cross-tenant session reuse: tenant-1 session presented on tenant 2
p me-cross-tenant "$(curl -s -b $CJ $B/auth/me -H 'x-tenant-id: 2' -o /dev/null -w '%{http_code}')"

# --- admin write without auth is rejected; with auth allowed ---
p write-unauth "$(curl -s -X PATCH $B/tenant-brand -H "$J" -H 'x-tenant-id: 1' -d '{"name":"Hacked"}' -o /dev/null -w '%{http_code}')"
p write-auth "$(curl -s -b $CJ -X PATCH $B/tenant-brand -H "$J" -H 'x-tenant-id: 1' -d '{}' -o /dev/null -w '%{http_code}')"
# cross-tenant write with tenant-1 session
p write-cross-tenant "$(curl -s -b $CJ -X PATCH $B/tenant-brand -H "$J" -H 'x-tenant-id: 3' -d '{"name":"Hacked"}' -o /dev/null -w '%{http_code}')"

# --- tenant isolation on reads ---
p brand-t1 "$(curl -s $B/tenant-brand -H 'x-tenant-id: 1' | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
p brand-t7 "$(curl -s $B/tenant-brand -H 'x-tenant-id: 7' | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
p brand-unknown-tenant "$(curl -s $B/tenant-brand -H 'x-tenant-id: 999' -o /dev/null -w '%{http_code}')"

# --- entitlements (billing dormant => pass-through expected) ---
p tenant-plan "$(curl -s $B/tenant-plan -H 'x-tenant-id: 2' | head -c 200)"
p billing-checkout-unauth "$(curl -s -X POST $B/billing/checkout -H "$J" -H 'x-tenant-id: 1' -d '{}' -o /dev/null -w '%{http_code}')"
p billing-checkout-auth "$(curl -s -b $CJ -X POST $B/billing/checkout -H "$J" -H 'x-tenant-id: 1' -d '{"plan":"pro"}' -o /dev/null -w '%{http_code}') $(curl -s -b $CJ -X POST $B/billing/checkout -H "$J" -H 'x-tenant-id: 1' -d '{"plan":"pro"}' | head -c 160)"

# --- platform admin ---
p platform-me-unauth "$(curl -s $B/platform-admin/me -o /dev/null -w '%{http_code}')"
p platform-login "$(curl -s -c /tmp/probe-plat.txt -X POST $B/platform-admin/login -H "$J" -d '{"email":"ash.wyborn@charleshull.com.au","password":"PlatformAdmin!2026"}' -o /dev/null -w '%{http_code}')"
p platform-tenants "$(curl -s -b /tmp/probe-plat.txt $B/platform-admin/tenants | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else list(d.keys()))' 2>/dev/null)"
# club-admin session must NOT satisfy platform gate
p platform-with-club-session "$(curl -s -b $CJ $B/platform-admin/me -o /dev/null -w '%{http_code}')"

# --- self-serve signup discovery + rate limit ---
p available-clubs "$(curl -s "$B/platform/available-clubs" | head -c 200)"
p slug-check "$(curl -s "$B/platform/slug-available?slug=mandurah" | head -c 80)"
RL=0; for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' "$B/platform/slug-available?slug=test$i"); [ "$c" = "429" ] && RL=$((RL+1)); done
p signup-rate-limit-429s "$RL/40"

# --- juniors isolation: /api/juniors namespace exists, no senior bleed ---
p juniors-overview "$(curl -s $B/juniors/overview -H 'x-tenant-id: 1' -o /dev/null -w '%{http_code}')"

# --- central read: leaderboard for two clubs differ & scoped ---
p leaderboard-t2-count "$(curl -s "$B/grades/A%20Grade/leaderboard" -H 'x-tenant-id: 2' | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
p leaderboard-t9-count "$(curl -s "$B/grades/A%20Grade/leaderboard" -H 'x-tenant-id: 9' | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
p leaderboard-disjoint "$(python3 - <<'PY'
import json, urllib.request
def names(t):
    r = urllib.request.Request("http://localhost:8080/api/grades/A%20Grade/leaderboard", headers={"x-tenant-id": str(t)})
    return {(x["givenName"], x["surname"]) for x in json.load(urllib.request.urlopen(r))}
a, b = names(2), names(9)
print("no-overlap" if not (a & b) else f"OVERLAP {len(a&b)}")
PY
)"

# --- problem+json / content type on error ---
p error-content-type "$(curl -s -D - -o /dev/null -X POST $B/auth/login -H "$J" -H 'x-tenant-id: 1' -d '{}' | grep -i '^content-type' | tr -d '\r')"
echo DONE
