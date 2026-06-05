# Phase 1 执行计划

**开始日期**: 2026-06-05  
**预计完成**: 2026-07-24 (6-8周)  
**预算**: $70,800  
**状态**: 🚀 启动中

---

## 🎯 执行策略

基于v2.0报告的修正建议，采用以下执行策略：

### Week 1-2: 实时推送（优先，最快见效）
- 全栈工程师独立完成
- 2周交付可用功能
- 快速建立团队信心

### Week 1-4: MCP执行桥（并行开发）
- 2名后端工程师
- 与实时推送并行
- 4周交付首批工具

### Week 3-4: 多模型架构设计
- 架构设计评审
- 不使用UniversalWorkerAdapter
- 原型验证

### Week 5-7: 多模型Router实现
- 基于评审通过的架构
- 集成CostLedger
- 4-5周完整实现

---

## 📋 任务清单

### 阶段1: 实时推送 (Week 1-2)

#### Task 1.1: WebSocket Server基础设施
- [ ] 安装ws依赖
- [ ] 实现ProgressWebSocketServer
- [ ] 实现连接管理和心跳
- [ ] 实现token鉴权
- [ ] 实现连接清理

#### Task 1.2: RunEventService集成
- [ ] 修改recordEvent()添加广播
- [ ] 确保推送失败不影响存储
- [ ] 添加事件脱敏检查

#### Task 1.3: API端点
- [ ] 添加/ws/progress路由
- [ ] 集成到startApiServer
- [ ] 添加健康检查

#### Task 1.4: 测试
- [ ] 单元测试：连接、断线、鉴权
- [ ] 集成测试：完整事件流
- [ ] 压力测试：多客户端

#### Task 1.5: 前端集成
- [ ] JavaScript客户端
- [ ] 自动降级到轮询
- [ ] Operator Console集成

---

### 阶段2: MCP执行桥 (Week 1-4)

#### Task 2.1: MCP Client基础
- [ ] 安装@modelcontextprotocol/sdk
- [ ] 实现McpClient类
  - connect/disconnect
  - listTools
  - callTool
  - lifecycle管理

#### Task 2.2: MCP风险映射
- [ ] 实现McpRiskMapper
- [ ] 工具名称→风险等级推断
- [ ] 保守默认策略

#### Task 2.3: Tool Gateway集成
- [ ] 设计mcp.invoke路由
- [ ] 或映射到现有scanner.run_template
- [ ] scope/risk/approval/rate检查
- [ ] 输出→evidence转换

#### Task 2.4: 首批工具接入
- [ ] 选择3个高价值工具：
  - nuclei-compatible
  - httpx-compatible
  - semgrep-compatible
- [ ] 每个工具配fixture
- [ ] 错误处理和超时
- [ ] 证据解析策略

#### Task 2.5: 测试和文档
- [ ] 端到端测试
- [ ] 错误路径测试
- [ ] 操作员文档
- [ ] 安全审查

---

### 阶段3: 多模型Router (Week 3-7)

#### Task 3.1: 架构设计评审 (Week 3-4)
- [ ] 评审v1.1的UniversalWorkerAdapter方案
- [ ] 设计方案A: 增强CliWorkerAdapter
- [ ] 设计方案B: 新增OpenAICompatibleWorkerAdapter
- [ ] 选择最终方案
- [ ] 原型验证

#### Task 3.2: Provider适配器 (Week 5-6)
- [ ] 实现选定的架构方案
- [ ] OpenAI-compatible接口
- [ ] DeepSeek/Qwen配置
- [ ] 错误处理和重试
- [ ] Schema修复

#### Task 3.3: ModelRouterService (Week 6)
- [ ] 任务类型推断
- [ ] 模型选择逻辑
- [ ] 与WorkerSelectionPolicy集成
- [ ] 预算感知路由

#### Task 3.4: CostLedger扩展 (Week 7)
- [ ] 添加provider字段
- [ ] 添加model字段
- [ ] token/cost估算
- [ ] fallback原因记录

#### Task 3.5: 测试和集成 (Week 7)
- [ ] 单元测试
- [ ] 集成测试
- [ ] 真实模型验证
- [ ] 文档更新

---

## 🎯 里程碑

### Milestone 1: 实时推送可用 (Week 2)
**验收标准**：
- [ ] WebSocket server运行稳定
- [ ] 前端自动订阅成功
- [ ] 断线自动降级到轮询
- [ ] 事件延迟<100ms
- [ ] 测试覆盖率>80%

### Milestone 2: MCP首个工具闭环 (Week 4)
**验收标准**：
- [ ] 至少1个MCP工具可用
- [ ] plan/invoke/audit/evidence完整闭环
- [ ] 所有调用经过Tool Gateway
- [ ] fixture和错误处理完整
- [ ] 安全审查通过

### Milestone 3: 多模型架构确认 (Week 4)
**验收标准**：
- [ ] 架构设计评审通过
- [ ] 原型验证成功
- [ ] 不破坏现有Worker抽象
- [ ] 技术方案文档完成

### Milestone 4: 多模型Router可用 (Week 8)
**验收标准**：
- [ ] 至少2个Provider路径可用
- [ ] ModelRouterService工作
- [ ] CostLedger记录完整
- [ ] 真实场景验证通过
- [ ] 文档完整

---

## 🚨 风险和缓解

### Risk 1: WebSocket连接管理复杂
**概率**: 中  
**影响**: 中  
**缓解**: 
- 使用成熟的ws库
- 实现心跳和自动重连
- 保留轮询降级

### Risk 2: MCP工具输出不稳定
**概率**: 高  
**影响**: 中  
**缓解**:
- 每个工具独立fixture
- 默认fail-closed
- 完整错误处理

### Risk 3: 多模型架构设计争议
**概率**: 中  
**影响**: 高  
**缓解**:
- Week 3-4专门评审
- 原型验证
- 技术负责人最终决策

### Risk 4: 时间超支
**概率**: 中  
**影响**: 中  
**缓解**:
- 每周进度检查
- 预算含37%缓冲
- 可砍非关键功能

---

## 📊 进度追踪

### Week 1
- [ ] 实时推送：基础设施搭建
- [ ] MCP执行桥：依赖安装和基础类

### Week 2
- [ ] 实时推送：前端集成和测试
- [ ] MCP执行桥：风险映射和Gateway集成

### Week 3
- [ ] MCP执行桥：首批工具接入
- [ ] 多模型Router：架构设计评审启动

### Week 4
- [ ] MCP执行桥：测试和文档
- [ ] 多模型Router：架构设计评审完成

### Week 5-6
- [ ] 多模型Router：Provider适配器实现

### Week 7
- [ ] 多模型Router：CostLedger集成

### Week 8
- [ ] 多模型Router：测试和文档
- [ ] Phase 1验收

---

## ✅ 当前状态

**项目基础验证**:
- [x] 代码审查完成
- [x] 测试通过 (82/82)
- [x] 架构理解完成
- [x] 执行计划制定完成

**准备启动**:
- [ ] 团队资源确认
- [ ] 技术决策会议
- [ ] 开发环境准备

---

**计划版本**: v1.0  
**基于报告**: AgentRed-优化方案-执行总结-v2.md  
**下一步**: 开始Task 1.1
