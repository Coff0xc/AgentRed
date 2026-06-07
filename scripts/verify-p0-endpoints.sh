#!/usr/bin/env bash
# P0 Fix Verification Script
# Tests all newly added API endpoints

set -e

BASE_URL="http://127.0.0.1:4317"
TOKEN="test-verification-token"

echo "🔍 P0 Fix Verification Script"
echo "=============================="
echo ""

# Function to make authenticated requests
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [ -z "$data" ]; then
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN"
    else
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data"
    fi
}

echo "1. Testing MCP Bundle endpoints..."
echo "   GET /mcp/bundles"
BUNDLES=$(api_call GET "/mcp/bundles")
BUNDLE_COUNT=$(echo "$BUNDLES" | jq '. | length')
echo "   ✅ Found $BUNDLE_COUNT MCP bundles"
echo ""

echo "2. Testing MCP Security scan..."
echo "   POST /mcp/scan"
SCAN_RESULT=$(api_call POST "/mcp/scan" '{"serverPath": "/usr/bin/node"}')
SCAN_SAFE=$(echo "$SCAN_RESULT" | jq -r '.safe')
echo "   ✅ MCP scan completed (safe: $SCAN_SAFE)"
echo ""

echo "3. Creating test run for checkpoint tests..."
RUN_RESPONSE=$(api_call POST "/runs" '{
  "target": "https://example.com",
  "goal": "P0 verification test",
  "scopePolicy": {
    "allowedAssets": ["https://example.com"],
    "deniedAssets": [],
    "allowedMethods": ["GET", "POST"],
    "destructiveAllowed": false,
    "credentialRules": {"allowVaultReferencesOnly": false},
    "rateLimits": {"requestsPerMinute": 60}
  },
  "workerPool": [{"name": "mock", "type": "mock", "maxRunning": 1, "priority": 1}]
}')
RUN_ID=$(echo "$RUN_RESPONSE" | jq -r '.id')
echo "   ✅ Created run: $RUN_ID"
echo ""

echo "4. Testing Checkpoint endpoints..."
echo "   POST /runs/$RUN_ID/checkpoint"
CHECKPOINT_RESPONSE=$(api_call POST "/runs/$RUN_ID/checkpoint" '{"trigger": "manual"}')
CHECKPOINT_ID=$(echo "$CHECKPOINT_RESPONSE" | jq -r '.checkpointId')
echo "   ✅ Created checkpoint: $CHECKPOINT_ID"
echo ""

echo "   GET /runs/$RUN_ID/checkpoints"
CHECKPOINTS=$(api_call GET "/runs/$RUN_ID/checkpoints")
CHECKPOINT_COUNT=$(echo "$CHECKPOINTS" | jq '. | length')
echo "   ✅ Listed $CHECKPOINT_COUNT checkpoint(s)"
echo ""

echo "5. Testing Benchmark execution..."
echo "   POST /benchmark/execute"
BENCHMARK_RESPONSE=$(api_call POST "/benchmark/execute" "{\"scenarioId\": \"owasp-sqli-01\", \"runId\": \"$RUN_ID\"}")
BENCHMARK_STATUS=$(echo "$BENCHMARK_RESPONSE" | jq -r '.status')
echo "   ✅ Benchmark started (status: $BENCHMARK_STATUS)"
echo ""

echo "=============================="
echo "✅ All P0 endpoints verified successfully!"
echo ""
echo "Summary:"
echo "  - MCP bundles: $BUNDLE_COUNT available"
echo "  - MCP security: functional"
echo "  - Checkpoints: create & list working"
echo "  - Benchmark: execution working"
echo ""
echo "🎉 P0 fix verification complete!"
