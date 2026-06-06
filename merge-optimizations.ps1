# AgentRed全量优化合并脚本
# 自动合并所有16个worktree的改动到主分支

Write-Host "🚀 开始合并AgentRed全量优化..." -ForegroundColor Green
Write-Host ""

# 工作目录
$rootDir = "D:\PR\GITHUB-REDTEAM"
$worktreeBase = ".claude\worktrees"

# 16个worktree对应的功能模块
$worktrees = @(
    @{ id = "wf_8eeaa15e-905-1"; name = "P0-1: 基准测试套件" },
    @{ id = "wf_8eeaa15e-905-2"; name = "P0-2: MCP治理层" },
    @{ id = "wf_8eeaa15e-905-3"; name = "P0-3: Docker沙箱" },
    @{ id = "wf_8eeaa15e-905-4"; name = "P1-1: AI基础设施扫描" },
    @{ id = "wf_8eeaa15e-905-5"; name = "P1-2: 会话恢复" },
    @{ id = "wf_8eeaa15e-905-6"; name = "P1-3: 外部平台集成" },
    @{ id = "wf_8eeaa15e-905-7"; name = "P1-4: 扫描器适配器" },
    @{ id = "wf_8eeaa15e-905-8"; name = "P1-5: TUI界面" },
    @{ id = "wf_8eeaa15e-905-9"; name = "P2-1: 多智能体协作" },
    @{ id = "wf_8eeaa15e-905-10"; name = "P2-2: PyRIT集成" },
    @{ id = "wf_8eeaa15e-905-11"; name = "P2-3: 知识图谱" },
    @{ id = "wf_8eeaa15e-905-12"; name = "P2-4: 报告模板" },
    @{ id = "wf_8eeaa15e-905-13"; name = "P2-5: 浏览器增强" },
    @{ id = "wf_8eeaa15e-905-14"; name = "P2-6: WebSocket推送" },
    @{ id = "wf_8eeaa15e-905-15"; name = "P2-7: 成本优化" },
    @{ id = "wf_8eeaa15e-905-16"; name = "集成测试" }
)

$totalFiles = 0
$successCount = 0
$failCount = 0

foreach ($wt in $worktrees) {
    $wtPath = Join-Path $rootDir $worktreeBase $wt.id

    Write-Host "📦 处理: $($wt.name)" -ForegroundColor Cyan
    Write-Host "   路径: $wtPath"

    if (Test-Path $wtPath) {
        # 统计worktree中的新增和修改文件
        Push-Location $wtPath

        try {
            # 获取所有新增和修改的文件
            $status = git status --porcelain 2>$null

            if ($status) {
                $files = $status -split "`n" | Where-Object { $_ -match '^\s*[AM?]\s+' }
                $fileCount = ($files | Measure-Object).Count

                Write-Host "   发现 $fileCount 个文件变更" -ForegroundColor Yellow

                # 复制文件到主分支
                foreach ($line in $files) {
                    if ($line -match '^\s*[AM?]\s+(.+)$') {
                        $file = $matches[1].Trim()
                        $srcFile = Join-Path $wtPath $file
                        $destFile = Join-Path $rootDir $file

                        if (Test-Path $srcFile) {
                            # 确保目标目录存在
                            $destDir = Split-Path $destFile -Parent
                            if (-not (Test-Path $destDir)) {
                                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                            }

                            # 复制文件
                            Copy-Item -Path $srcFile -Destination $destFile -Force
                            $totalFiles++
                        }
                    }
                }

                $successCount++
                Write-Host "   ✅ 完成" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  无变更" -ForegroundColor Gray
            }
        } catch {
            Write-Host "   ❌ 错误: $_" -ForegroundColor Red
            $failCount++
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "   ⚠️  worktree不存在" -ForegroundColor Gray
    }

    Write-Host ""
}

# 回到主分支，添加所有文件
Push-Location $rootDir

Write-Host "📝 添加所有文件到git..." -ForegroundColor Cyan
git add -A

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "✅ 合并完成！" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
Write-Host ""
Write-Host "📊 统计:" -ForegroundColor Cyan
Write-Host "   - 处理模块: $successCount/$($worktrees.Count)"
Write-Host "   - 总文件数: $totalFiles"
Write-Host "   - 失败数: $failCount"
Write-Host ""
Write-Host "🔍 下一步操作:" -ForegroundColor Yellow
Write-Host "   1. 检查状态: git status"
Write-Host "   2. 运行测试: npm run typecheck && npm test"
Write-Host "   3. 提交改动: git commit -m 'feat: implement all 15 optimization recommendations'"
Write-Host "   4. 推送代码: git push"
Write-Host ""

Pop-Location
