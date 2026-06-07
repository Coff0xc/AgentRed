# P0 Fix Verification Script (PowerShell)
# Tests all newly added API endpoints

$ErrorActionPreference = "Stop"

$BaseUrl = "http://127.0.0.1:4317"
$Token = "test-verification-token"

Write-Host "🔍 P0 Fix Verification Script" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

function Invoke-ApiCall {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Body = $null
    )

    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }

    $params = @{
        Uri = "$BaseUrl$Endpoint"
        Method = $Method
        Headers = $headers
    }

    if ($Body) {
        $params.Body = $Body
    }

    try {
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Host "❌ Error: $_" -ForegroundColor Red
        throw
    }
}

Write-Host "1. Testing MCP Bundle endpoints..." -ForegroundColor Yellow
Write-Host "   GET /mcp/bundles"
$bundles = Invoke-ApiCall -Method "GET" -Endpoint "/mcp/bundles"
$bundleCount = $bundles.Count
Write-Host "   ✅ Found $bundleCount MCP bundles" -ForegroundColor Green
Write-Host ""

Write-Host "2. Testing MCP Security scan..." -ForegroundColor Yellow
Write-Host "   POST /mcp/scan"
$scanBody = @{
    serverPath = "/usr/bin/node"
} | ConvertTo-Json
$scanResult = Invoke-ApiCall -Method "POST" -Endpoint "/mcp/scan" -Body $scanBody
$scanSafe = $scanResult.safe
Write-Host "   ✅ MCP scan completed (safe: $scanSafe)" -ForegroundColor Green
Write-Host ""

Write-Host "3. Creating test run for checkpoint tests..." -ForegroundColor Yellow
$runBody = @{
    target = "https://example.com"
    goal = "P0 verification test"
    scopePolicy = @{
        allowedAssets = @("https://example.com")
        deniedAssets = @()
        allowedMethods = @("GET", "POST")
        destructiveAllowed = $false
        credentialRules = @{
            allowVaultReferencesOnly = $false
        }
        rateLimits = @{
            requestsPerMinute = 60
        }
    }
    workerPool = @(
        @{
            name = "mock"
            type = "mock"
            maxRunning = 1
            priority = 1
        }
    )
} | ConvertTo-Json -Depth 10

$runResponse = Invoke-ApiCall -Method "POST" -Endpoint "/runs" -Body $runBody
$runId = $runResponse.id
Write-Host "   ✅ Created run: $runId" -ForegroundColor Green
Write-Host ""

Write-Host "4. Testing Checkpoint endpoints..." -ForegroundColor Yellow
Write-Host "   POST /runs/$runId/checkpoint"
$checkpointBody = @{
    trigger = "manual"
} | ConvertTo-Json
$checkpointResponse = Invoke-ApiCall -Method "POST" -Endpoint "/runs/$runId/checkpoint" -Body $checkpointBody
$checkpointId = $checkpointResponse.checkpointId
Write-Host "   ✅ Created checkpoint: $checkpointId" -ForegroundColor Green
Write-Host ""

Write-Host "   GET /runs/$runId/checkpoints"
$checkpoints = Invoke-ApiCall -Method "GET" -Endpoint "/runs/$runId/checkpoints"
$checkpointCount = $checkpoints.Count
Write-Host "   ✅ Listed $checkpointCount checkpoint(s)" -ForegroundColor Green
Write-Host ""

Write-Host "5. Testing Benchmark execution..." -ForegroundColor Yellow
Write-Host "   POST /benchmark/execute"
$benchmarkBody = @{
    scenarioId = "owasp-sqli-01"
    runId = $runId
} | ConvertTo-Json
$benchmarkResponse = Invoke-ApiCall -Method "POST" -Endpoint "/benchmark/execute" -Body $benchmarkBody
$benchmarkStatus = $benchmarkResponse.status
Write-Host "   ✅ Benchmark started (status: $benchmarkStatus)" -ForegroundColor Green
Write-Host ""

Write-Host "==============================" -ForegroundColor Cyan
Write-Host "✅ All P0 endpoints verified successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - MCP bundles: $bundleCount available"
Write-Host "  - MCP security: functional"
Write-Host "  - Checkpoints: create & list working"
Write-Host "  - Benchmark: execution working"
Write-Host ""
Write-Host "🎉 P0 fix verification complete!" -ForegroundColor Green
