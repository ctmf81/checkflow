#!/bin/bash

# verify-rollback.sh — Verify system health after rollback
# Usage: ./scripts/verify-rollback.sh [staging|production]

set -e

ENVIRONMENT=${1:-production}
API_HOST="api.checkflow.digital"
HEALTH_ENDPOINT="/health"

if [ "$ENVIRONMENT" = "staging" ]; then
  API_HOST="staging-api.checkflow.digital"
fi

HEALTH_URL="https://${API_HOST}${HEALTH_ENDPOINT}"

echo "🔍 Verifying rollback on $ENVIRONMENT..."
echo "   API: $HEALTH_URL"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
  local check=$1
  local status=$2
  if [ "$status" = "pass" ]; then
    echo -e "${GREEN}✓${NC} $check"
  elif [ "$status" = "fail" ]; then
    echo -e "${RED}✗${NC} $check"
    exit 1
  else
    echo -e "${YELLOW}⚠${NC} $check"
  fi
}

# 1. Check health endpoint
echo "1️⃣  Health Endpoint Check"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "503" ]; then
  print_status "API responding" "pass"
else
  print_status "API responding (HTTP $HTTP_CODE)" "fail"
fi

echo ""

# 2. Parse health JSON
echo "2️⃣  System Status Checks"

STATUS=$(echo "$BODY" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
DB_STATUS=$(echo "$BODY" | grep -o '"database":{"status":[^,]*' | grep -o 'true\|false' | head -1)
RLS_STATUS=$(echo "$BODY" | grep -o '"rls":{"status":[^,]*' | grep -o 'true\|false' | head -1)
STORAGE_STATUS=$(echo "$BODY" | grep -o '"storage":{"status":[^,]*' | grep -o 'true\|false' | head -1)

if [ "$STATUS" = "healthy" ]; then
  print_status "Overall status: HEALTHY" "pass"
else
  print_status "Overall status: $STATUS" "warn"
fi

if [ "$DB_STATUS" = "true" ]; then
  DB_LATENCY=$(echo "$BODY" | grep -o '"database":{"status":[^}]*"latency_ms":\([0-9]*\)' | grep -o '[0-9]*$')
  print_status "Database connected (${DB_LATENCY}ms)" "pass"
else
  print_status "Database connected" "fail"
fi

if [ "$RLS_STATUS" = "true" ]; then
  RLS_LATENCY=$(echo "$BODY" | grep -o '"rls":{"status":[^}]*"latency_ms":\([0-9]*\)' | grep -o '[0-9]*$')
  print_status "RLS policy active (${RLS_LATENCY}ms)" "pass"
else
  print_status "RLS policy active" "fail"
fi

if [ "$STORAGE_STATUS" = "true" ]; then
  print_status "Storage accessible" "pass"
else
  print_status "Storage accessible" "warn"
fi

echo ""

# 3. Check uptime (should be low after recent deploy)
echo "3️⃣  Uptime Check"
UPTIME=$(echo "$BODY" | grep -o '"uptime_seconds":[0-9]*' | grep -o '[0-9]*$')
if [ -n "$UPTIME" ]; then
  UPTIME_MIN=$((UPTIME / 60))
  if [ "$UPTIME_MIN" -lt 5 ]; then
    print_status "Service restarted (${UPTIME_MIN}m ago)" "pass"
  else
    print_status "Service uptime: ${UPTIME_MIN}m" "warn"
  fi
fi

echo ""

# 4. Latency check
echo "4️⃣  Performance Check"
DB_MS=$(echo "$BODY" | grep -o '"database":{"status":[^}]*"latency_ms":\([0-9]*\)' | grep -o '[0-9]*$')
if [ -n "$DB_MS" ] && [ "$DB_MS" -lt 2000 ]; then
  print_status "Database latency < 2s (${DB_MS}ms)" "pass"
elif [ -n "$DB_MS" ]; then
  print_status "Database latency ${DB_MS}ms (threshold: 2000ms)" "warn"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Rollback verification complete${NC}"
echo ""
echo "📋 Next steps:"
echo "   1. Monitor /sistema/health dashboard for 5 minutes"
echo "   2. Test key features (login, checklist execution, billing)"
echo "   3. Check Rails logs: railway.app → Logs tab"
echo "   4. Alert team in Slack with results"
echo "   5. Create incident post-mortem"
echo ""
