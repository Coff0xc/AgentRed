# Phase 1 Week 2 - 任务启动清单

**开始日期**: 2026-06-05  
**预计完成**: 2026-06-12（1周）  
**目标**: MCP执行桥基础实现

---

## 🎯 Week 2 核心目标

基于Week 1的成功经验（提前1周完成WebSocket），Week 2专注于**MCP执行桥**的基础实现。

### 主要任务
1. ✅ 安装MCP SDK依赖
2. ⏸️ 实现McpClient类
3. ⏸️ 实现McpRiskMapper
4. ⏸️ Tool Gateway集成
5. ⏸️ 首批3个MCP工具接入

---

## 📋 任务详细清单

### Task 2.1: MCP SDK依赖 ✅

**目标**: 安装@modelcontextprotocol/sdk

**步骤**:
- [x] 检查npm registry是否有该包
- [x] 安装SDK包和类型定义
- [x] 验证安装成功

### Task 2.2: McpClient类实现 ⏸️

**文件**: `src/connectors/mcp-execution-service.ts`

**需要实现的方法**:
```typescript
class McpClient {
  - connect(serverUrl: string, config: McpServerConfig): Promise<void>
  - disconnect(): Promise<void>
  - listTools(): Promise<McpTool[]>
  - callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>
  - healthcheck(): Promise<boolean>
}
```

**关键点**:
- stdio transport支持（本地MCP server）
- HTTP/SSE transport支持（远程MCP server）
- 连接超时管理（30秒）
- 工具调用超时（2分钟）
- 错误重试策略（最多3次）

### Task 2.3: McpRiskMapper实现 ⏸️

**文件**: `src/connectors/mcp-risk-mapper.ts`

**功能**:
```typescript
class McpRiskMapper {
  // 根据工具名称推断风险等级
  inferRiskLevel(toolName: string): RiskLevel;
  
  // 示例映射：
  // - *scan*, *probe*, *discover* → R1
  // - *exploit*, *inject*, *execute* → R3
  // - *delete*, *drop*, *destroy* → R4
}
```

**默认策略**: fail-safe，未知工具默认R3（需要审批）

### Task 2.4: Tool Gateway集成 ⏸️

**文件**: `src/tools/tool-gateway.ts`

**新增路由**: `mcp.invoke`

**集成点**:
```typescript
// 在ToolGateway中添加
case 'mcp.invoke': {
  // 1. 验证scope
  // 2. 检查风险等级
  // 3. 检查approval
  // 4. 调用McpClient
  // 5. 转换输出为evidence
  // 6. 生成audit记录
}
```

### Task 2.5: 首批MCP工具选择 ⏸️

**候选工具**:
1. **nuclei-compatible MCP server**
   - 风险等级: R2
   - 用途: 安全扫描
   - 证据类型: scanner_output

2. **httpx-compatible MCP server**
   - 风险等级: R1
   - 用途: HTTP探测
   - 证据类型: http_metadata

3. **semgrep-compatible MCP server**
   - 风险等级: R1
   - 用途: 代码扫描
   - 证据类型: sast_result

**每个工具需要**:
- [ ] fixture（测试数据）
- [ ] 错误处理测试
- [ ] 证据解析策略
- [ ] scope检查测试

---

## 🚧 当前阻塞点

### 阻塞1: @modelcontextprotocol/sdk可用性
**状态**: 需要验证npm包是否公开可用

**解决方案**:
- 方案A: 如果包可用，直接安装
- 方案B: 如果包不可用，实现minimal MCP protocol

### 阻塞2: MCP server选择
**状态**: 需要确认哪些MCP server可用

**解决方案**:
- 先实现protocol层
- 后续再接入具体server

---

## ✅ 准备就绪检查

- [x] Week 1任务完成
- [x] 87/87测试通过
- [x] TypeScript类型检查通过
- [x] Git工作区干净
- [x] 文档完整

---

## 📊 预期输出

### Week 2结束时交付
1. [ ] McpClient类完整实现
2. [ ] McpRiskMapper实现
3. [ ] Tool Gateway集成mcp.invoke
4. [ ] 至少1个MCP工具完整闭环
5. [ ] 测试覆盖：新增5-8个测试
6. [ ] 文档更新：API文档、架构文档

### 验收标准
- [ ] npm test通过（预期92+测试）
- [ ] npm run typecheck通过
- [ ] 首个MCP工具可以通过Tool Gateway调用
- [ ] 生成的evidence有完整SHA-256哈希
- [ ] 所有MCP调用有audit记录

---

## 🎓 Week 1经验应用

### 应用到Week 2
1. ✅ **架构设计在前**: 先定义McpClient接口
2. ✅ **测试驱动**: 每个功能都有测试
3. ✅ **增量交付**: Client→Mapper→Gateway→Tools
4. ✅ **安全边界清晰**: MCP不能绕过Tool Gateway

---

**创建时间**: 2026-06-05  
**状态**: 准备启动  
**下次更新**: Task 2.1完成后
