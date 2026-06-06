# AgentRed TUI

Terminal User Interface for AgentRed - 类似 htop 的实时监控界面。

## 功能特性

- **实时更新**: 通过 WebSocket 连接接收平台事件推送
- **多视图模式**: 
  - Runs 视图：显示所有运行中的任务
  - Intents 视图：显示当前意图和探索状态
  - Evidence 视图：显示收集的证据和发现的漏洞
- **键盘导航**: 类似 htop 的快捷键操作
- **状态高亮**: 使用颜色区分不同的状态和风险等级

## 安装依赖

```bash
npm install
```

TUI 需要以下依赖：
- `ink` - React for CLI
- `react` - React library
- `yoga-layout-prebuilt` - Layout engine

## 使用方法

### 方式 1: 使用 npm 脚本

```bash
# 设置环境变量
export PLATFORM_API_TOKEN=your-token-here

# 启动 TUI
npm run tui
```

### 方式 2: 使用命令行参数

```bash
# 指定 API URL 和 token
npm run tui -- --url=http://127.0.0.1:4317 --token=your-token-here
```

### 方式 3: 直接运行

```bash
# 安装后可以直接运行
tsx bin/agentred-tui.js --url=http://127.0.0.1:4317 --token=your-token-here
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Tab` | 切换视图 (Runs → Intents → Evidence) |
| `↑`/`↓` | 在 Runs 列表中导航 |
| `r` | 手动刷新数据 |
| `q` | 退出 TUI |
| `Ctrl+C` | 退出 TUI |

## 界面布局

```
┌─────────────────────────────────────────────────────────────────┐
│ AgentRed TUI - Terminal User Interface                         │
│ API: http://127.0.0.1:4317              WS: ● Updated: 10:30:45│
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ [1] Runs  [2] Intents  [3] Evidence    Tab: Switch | q: Quit   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ ID            STATUS      TARGET                    GOAL         │
│ run_abc123    ACTIVE      https://example.com       Find XSS... │
│ run_def456    COMPLETED   https://test.com          API test... │
└─────────────────────────────────────────────────────────────────┘
│ Runs: 2 | Intents: 5 | Evidence: 12 | Findings: 3              │
└─────────────────────────────────────────────────────────────────┘
```

## 视图说明

### Runs 视图
- 显示所有测试运行
- 状态颜色：
  - 🟢 ACTIVE (绿色)
  - 🔵 COMPLETED (青色)
  - 🟡 STOPPED (黄色)
- 支持上下键选择运行

### Intents 视图
- 显示选中 run 的所有意图
- 默认只显示 open 和 claimed 状态
- 风险等级颜色：
  - 🟢 R0 (绿色) - 元数据读取
  - 🔵 R1 (青色) - 普通 HTTP 请求
  - 🟡 R2 (黄色) - 扫描和 fuzzing
  - 🔴 R3 (红色) - exploit 验证
  - 🟣 R4 (品红) - 破坏性操作

### Evidence 视图
- 上半部分：显示收集的证据
  - 证据类型：http_exchange, command_output, screenshot 等
  - 脱敏状态：raw_local_only, redacted, safe_for_cloud
- 下半部分：显示发现的漏洞
  - 严重程度：critical, high, medium, low, info
  - 验证状态：candidate, confirmed, rejected

## WebSocket 连接

TUI 自动连接到平台的 WebSocket 端点 `/ws/progress`，接收实时更新：
- 意图状态变化
- 证据收集事件
- 漏洞发现事件
- 工具执行结果

连接状态显示在顶部状态栏：
- 🟢 ● 已连接
- 🔴 ○ 未连接

## 故障排查

### 连接失败
```bash
# 检查 API 服务是否运行
curl http://127.0.0.1:4317/runs

# 检查 token 是否正确
curl -H "X-Platform-Token: your-token" http://127.0.0.1:4317/runs
```

### 显示异常
TUI 需要支持 ANSI 颜色的终端。推荐使用：
- Windows Terminal
- iTerm2 (macOS)
- GNOME Terminal (Linux)
- VS Code 集成终端

### 性能问题
如果数据量很大，可以：
- 减少刷新频率（修改 `TuiApp` 中的 interval）
- 限制显示的 evidence 数量（调整 `maxItems` prop）

## 架构

TUI 使用以下技术栈：
- **Ink**: React for CLI，声明式 UI 构建
- **WebSocket**: 实时双向通信
- **React Hooks**: 状态管理和副作用处理

主要组件：
- `TuiApp`: 主应用，管理状态和键盘输入
- `RunList`: 运行列表组件
- `IntentViewer`: 意图查看器
- `EvidencePanel`: 证据和漏洞面板
- `useWebSocket`: WebSocket 连接 hook

## 测试

```bash
# 运行 TUI 组件测试
npm test tests/tui.test.tsx

# 运行所有测试
npm test
```

测试使用 `ink-testing-library` 进行快照和行为验证。

## 开发

```bash
# 监听模式运行 TUI
npm run dev &
npm run tui

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 限制

- 当前不支持交互式创建 run（只读模式）
- 不支持审批操作（需要使用 Web UI 或 API）
- 终端宽度建议至少 100 列以获得最佳显示效果
- 不支持鼠标操作（纯键盘导航）

## 未来改进

- [ ] 支持多列排序
- [ ] 添加搜索/过滤功能
- [ ] 支持审批操作
- [ ] 添加详细视图（按 Enter 展开）
- [ ] 支持导出当前视图
- [ ] 添加日志尾部跟踪模式
