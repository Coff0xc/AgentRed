# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AgentRed 是一个本地优先、证据驱动、带安全门禁的 AI 红队渗透测试智能体平台。

核心原则：AI Worker 负责分析和建议，平台负责控制边界、调用工具、保存证据、审批高风险动作。Agent Workers **不能直接执行工具或写入状态**，所有操作必须通过 Dispatcher 和 Tool Gateway。

## 常用命令

### 开发工作流
```bash
# 安装依赖（首次或更新package.json后）
npm ci

# 类型检查（修改代码后必须运行）
npm run typecheck

# 运行测试
npm test

# 运行集成测试
npm run test:integration

# 编译
npm run build

# 启动本地开发服务（需要设置PLATFORM_API_TOKEN）
npm run dev
```

### 启动本地服务

**Windows (PowerShell):**
```powershell
$env:PLATFORM_API_TOKEN = "local-dev-token"
npm run dev
```

**Linux / macOS:**
```bash
PLATFORM_API_TOKEN=local-dev-token npm run dev
```

本地控制台：`http://127.0.0.1:4317/app`

### 外部扫描器开发

启用外部toolbox（如nuclei）需要多个环境变量：
```bash
PLATFORM_API_TOKEN=local-dev-token \
PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1 \
PLATFORM_ALLOWED_SCANNER_TEMPLATES=web.nuclei.safe_templates \
PLATFORM_ENABLE_CONTAINER_TOOLBOX=1 \
npm run dev
```

## 核心架构

### 不变式（Invariants）

**最重要的规则：只有 dispatcher 和 first-party services 能写协议状态。**

Agent Workers：
- 接收一个任务
- 观察图快照
- 返回结构化 JSON
- **永远不能**：claim intents、直接写 facts/findings/evidence/approvals、与其他 workers 通信、直接执行工具

### 数据模型（Graph Model）

- **Run** - 授权容器，包含 target、goal、scopePolicy、workerPool
- **Fact** - 已写入图的客观陈述
- **Intent** - 提议的探索方向（状态：open → claimed → concluded/released）
- **Evidence** - 可复现的证据（SHA-256哈希、本地blob、脱敏状态）
- **Finding** - 可报告的漏洞候选，**必须引用 evidence**
- **Report** - 报告bundle，默认只包含 confirmed findings
- **Approval** - R3风险动作的审批记录
- **CredentialReference** - 凭证引用（只存元数据，不存raw secret）
- **AccessReview** - 跨角色权限对比记录
- **OastSession** / **OastCallback** - 带外交互会话和回调

### Dispatcher 循环

```
bootstrap (首次任务) → reason (提出intent或完成) → explore (执行intent) → reason → explore → ...
```

**Intent Lease 机制：**
- open intent 被 claim 时获得 `leaseId`、`heartbeatAt`、`leaseExpiresAt`
- 过期的 claimed intent 自动释放回 open
- Worker 拒绝/超时/未结论 → intent 变为 released

### Tool Gateway

所有工具调用的**唯一检查点**，执行：
- allowed/denied assets 检查
- HTTP方法策略
- 风险等级（R0-R4）审批
- 速率限制
- 工具allowlist
- 生成audit记录和evidence

### 风险等级

| 等级 | 含义 | 默认处理 |
|------|------|----------|
| R0 | 元数据、被动读取 | 可执行 |
| R1 | 普通HTTP/浏览器动作 | 必须在scope内 |
| R2 | 扫描、有限fuzzing | 必须在scope内，受策略限制 |
| R3 | exploit验证、OAST、状态变化 | **必须人工审批** |
| R4 | 破坏、凭据窃取、持久化 | **默认阻断** |

### 证据引擎（Evidence Engine）

- 所有证据存储在本地，带SHA-256哈希
- 支持脱敏（redacted）状态
- 支持复核（review）状态：unreviewed、useful、duplicate、noise
- Finding **必须**引用 evidence，没有证据的"感觉像漏洞"不能进入报告

## 项目结构

```
src/
├── api/                  REST API和本地控制台
│   ├── server.ts         主服务器
│   └── startup-config.ts 启动配置
├── dispatcher/           AI Worker调度、intent lease、多轮explore
│   └── dispatcher.ts
├── workers/              Worker协议、Mock、CLI、Claude适配器
├── tools/                Tool Gateway、扫描模板、toolbox
├── graph/                Run Graph状态管理
│   └── graph-server.ts
├── evidence/             证据保存、哈希、内容读取
│   ├── evidence-engine.ts
│   └── evidence-review-service.ts
├── findings/             Finding创建和验证
│   └── finding-service.ts
├── reports/              报告和导出
├── scope/                授权范围判断（ScopePolicy）
├── strategy/             策略建议、Autopilot phase gate
├── scanners/             Scanner结果导入（如nuclei JSONL）
├── oast/                 OAST会话和callback证据
│   └── oast-service.ts
├── credentials/          凭证引用（不存储raw secret）
│   └── credential-reference-service.ts
├── access/               跨角色evidence对比
│   └── access-review-service.ts
├── observability/        监督、评分、雷达、成本和质量指标
├── storage/              内存和SQLite存储
├── autopilot/            自动化循环
├── agents/               Agent框架服务
├── desktop/              桌面runner就绪性
├── mobile/               Android manifest导入
├── cloud/                Cloud IAM导入
├── identity/             Identity graph导入
└── index.ts              服务入口
```

## 开发规则（必须遵守）

### 安全边界
1. **永远不让 Worker 直接执行工具** - 必须通过 Tool Gateway
2. **永远不让 Worker 直接写入状态** - 不能写 evidence、finding、approval、report
3. **永远不绕过 ScopePolicy** - 所有目标必须经过授权范围检查
4. **永远不绕过 Tool Gateway** - 所有工具调用必须经过门禁
5. **永远不把 secret 写入代码** - 不能写进代码、日志、测试fixture、README

### 质量要求
6. **安全敏感逻辑必须有测试** - 特别是 scope、approval、evidence、finding 相关
7. **外部 scanner 必须类型化** - 需要 typed adapter、allowlist、profile readiness、scope gate
8. **高风险动作必须可审计** - 必须能被审计和复核

### Fail-closed 原则
- 目标不在 allowlist → 阻断
- 目标在 denylist → 阻断
- HTTP方法不允许 → 阻断
- 工具未注册 → 阻断
- 风险等级超出策略 → 阻断
- R3没审批 → 阻断并生成 approval request
- R4没 break-glass token → 阻断
- Finding 没 evidence → 拒绝
- 报告没 confirmed finding → 拒绝

## Agent Worker 协议

### Worker 输入（envelope）
Worker 接收 `agent-worker.v1` 协议 envelope，包含：
- 任务图和active intent
- 治理的高级工具表面（从 `/tool-catalog`）
- 安全的凭证引用元数据
- 启用的PoC模板上下文
- 启用的Toolbox Bundle上下文
- 当前策略建议
- **硬规则**：禁止直接工具执行、直接图写入、worker间协调

### Worker 输出
Worker 必须返回结构化的 `WorkerTaskResult` JSON：
```typescript
{
  "accepted": true,
  "data": {
    "description": "...",
    "toolRequests": [
      {
        "tool": "http.request",
        "target": "https://app.example.com/api",
        "method": "GET",
        "riskLevel": "R1",
        "args": {}
      }
    ],
    "continueExplore": false  // 多轮explore时设为true
  }
}
```

### 多轮 Explore
Worker 可以在 explore 结果中返回 `"continueExplore": true`，平台行为：
- 先执行本轮 `toolRequests`
- 保存产生的 evidence
- 下一轮重新读取最新 graph
- 把 `producedEvidenceIds` 传回 Worker
- 最多 4 轮
- 4轮后仍要求继续 → Dispatcher 释放 intent 并记录 blocked reason

## 外部扫描器集成

### 必需条件
外部扫描器（nuclei、nmap等）默认**不会直接执行**。要运行必须同时满足：
1. 模板在平台注册
2. 目标在 ScopePolicy 授权范围内
3. 风险等级允许
4. 需要审批的动作已审批
5. 环境变量允许外部 toolbox (`PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1`)
6. 对应 profile 可用
7. 模板在 allowlist 中 (`PLATFORM_ALLOWED_SCANNER_TEMPLATES`)

### Typed Scanner Template
- 每个外部扫描器需要 typed adapter
- 输出格式必须结构化（如 nuclei JSONL）
- 解析失败不会阻断原始 command output evidence 的保存
- 模板示例：`web.nuclei.safe_templates`

## 测试策略

### 运行测试
```bash
# 所有单元测试
npm test

# 集成测试（包含容器扫描器）
npm run test:integration
```

### 测试文件位置
- `tests/*.test.ts` - 单元和平台测试
- `tests/*.integration.ts` - 集成测试（需要外部依赖）

### 测试原则
- 安全门禁逻辑必须有测试覆盖
- 使用 memory storage 进行测试（不依赖 SQLite）
- Mock Worker 用于验证协议合规性
- 外部扫描器测试应隔离（`*.integration.ts`）

## API 重要端点

### Run 管理
- `POST /runs` - 创建授权测试任务
- `GET /runs/{id}/graph` - 查看图状态
- `GET /runs/{id}/mission-control` - 任务总览
- `POST /runs/{id}/dispatch` - 推进一步 AI 调度
- `POST /runs/{id}/autopilot/tick` - Autopilot 推进一步

### Tool Gateway
- `GET /tool-catalog` - 查看治理的工具表面
- `POST /runs/{id}/tools/plan` - 预览工具门禁决策（无副作用）
- `POST /runs/{id}/tools` - 调用工具（经过门禁）

### Evidence & Finding
- `POST /runs/{id}/evidence` - 添加证据
- `GET /evidence/{id}/content` - 读取证据内容
- `POST /evidence/{id}/review` - 复核证据
- `POST /runs/{id}/findings` - 创建 finding（需要 evidence）
- `POST /findings/{id}/validation` - 验证漏洞（确认/拒绝）

### Report & Export
- `POST /reports` - 生成报告（默认只含 confirmed findings）
- `POST /runs/{id}/exports` - 导出交付包（哈希化，排除 raw local-only evidence）

### Worker 管理
- `GET /runs/{id}/workers` - Worker pool 就绪状态
- `GET /runs/{id}/worker-envelope/preview` - 预览 Worker 输入（无副作用）

## 凭证和授权测试

### CredentialReference
- 不存储 raw passwords、tokens、JWTs、cookies
- 只存储角色、标签、allowed-use、vault引用
- Worker envelope 只接收安全元数据和IDs
- 使用：`credential.use_placeholder` 工具（记录审计）

### AccessReview
- `POST /runs/{id}/access-reviews/compare` - 创建跨角色对比
- 对比两个同一run的 evidence
- 生成脱敏的 diff artifact 作为新 evidence
- 响应差异信号 → 需人工验证 → 创建 Finding

## 可观测性

### Trace & Cost
- TraceSpan - 记录 dispatcher ticks、Worker执行、Tool Gateway调用
- CostLedgerEntry - 本地运行时成本和请求计数
- `GET /runs/{id}/observability` - trace和cost视图

### 评分系统
- `GET /runs/{id}/scorecard` - Run级别评分卡
- `GET /runs/{id}/capability-radar` - 能力雷达图
- `GET /worker-leaderboard` - 跨run的Worker排行榜
- `POST /runs/{id}/evaluations` - 创建质量评估

### 监督
- `GET /runs/{id}/supervisor` - 卡住循环检测
- `POST /runs/{id}/supervisor/tick` - 安全恢复（释放过期lease）

## 环境变量

### 必需
- `PLATFORM_API_TOKEN` - 平台API认证token（必填，服务不会自动生成）

### 外部工具
- `PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1` - 允许外部scanner执行
- `PLATFORM_ALLOWED_SCANNER_TEMPLATES` - 允许的模板（逗号分隔或`*`）
- `PLATFORM_ENABLE_CONTAINER_TOOLBOX=1` - 启用容器toolbox profile
- `PLATFORM_CONTAINER_RUNTIME=docker` - 容器运行时

### Claude Worker
- `ANTHROPIC_API_KEY` - Claude API密钥
- `CLAUDE_MODEL` - 模型名称（如 `claude-sonnet-4-5`）

## 常见工作流

### 添加新的扫描器模板
1. 在 `src/tools/` 创建 typed adapter
2. 定义输入schema和输出格式
3. 注册到 scanner template registry
4. 添加 profile readiness 检查
5. 配置风险等级和审批要求
6. 添加 allowlist 门禁
7. 编写测试（特别是scope检查）

### 添加新的高级工具
1. 在 Tool Gateway 注册工具
2. 定义输入验证schema
3. 实现 scope 检查
4. 实现风险等级检查
5. 生成 audit 记录
6. 产生结构化 evidence
7. 更新 `/tool-catalog`

### 添加新的 Worker 适配器
1. 实现 `agent-worker.v1` 协议
2. 接收 envelope JSON 作为输入
3. 返回 `WorkerTaskResult` JSON
4. 处理超时（配置的 `timeoutMs`）
5. 验证 schema 合规性
6. 不能直接执行工具或写状态
7. 通过 `toolRequests` 请求工具

### 处理高风险动作（R3/R4）
1. Worker 请求工具时设置 `riskLevel: "R3"`
2. Tool Gateway 检测到需要审批
3. 创建 approval request
4. Intent 被释放，不继续执行
5. 操作员通过 `/approvals/{id}/approve` 审批
6. 重新 dispatch，这次带审批通过
7. 工具执行，生成 evidence 和 audit

## 术语对照

- **Run** - 运行/任务
- **Intent** - 意图（探索方向）
- **Evidence** - 证据
- **Finding** - 发现（漏洞候选）
- **Scope Policy** - 授权范围策略
- **Tool Gateway** - 工具门禁
- **Worker** - 工作器（AI代理）
- **Dispatcher** - 调度器
- **Lease** - 租约（intent锁定机制）
- **Claim** - 声明/占用（intent）
- **Review** - 复核（证据）
- **Validation** - 验证（漏洞）
- **Approval** - 审批（高风险动作）
- **OAST** - Out-of-band Application Security Testing（带外安全测试）

## 文档

- `docs/API.md` - 完整API参考
- `docs/ARCHITECTURE.md` - 详细架构设计
- `docs/SECURITY_MODEL.md` - 安全模型
- `docs/MATURITY_ROADMAP.md` - 成熟度路线图
- `docs/ENTERPRISE_PENTEST_AGENT_WORKFLOWS.md` - 企业渗透测试工作流
- `README.md` - 项目总览和快速开始
