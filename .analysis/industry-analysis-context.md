# AI红队行业分析 - 上下文准备

**分析时间**: 2026-06-04
**工作流状态**: 运行中 (wf_559b7047-143)

## AgentRed当前定位总结

### 核心架构优势
1. **Dispatcher-owned状态** - 只有调度器和一方服务写协议状态
2. **严格的Worker边界** - Worker只观察、建议，不直接执行
3. **Tool Gateway门禁** - 5级风险控制（R0-R4）+ fail-closed设计
4. **证据为中心** - 所有finding必须有SHA-256验证的证据支持
5. **本地优先** - 敏感数据本地存储，云端只同步已脱敏内容

### 已实现的企业级能力
- ✅ ScopePolicy授权范围控制
- ✅ 多轮探索（最多4轮）+ producedEvidenceIds反馈
- ✅ R3/R4人工审批流程
- ✅ 证据脱敏和复核状态
- ✅ 漏洞生命周期（candidate → confirmed → rejected）
- ✅ Scanner结果自动导入（nuclei/httpx/ffuf/sqlmap/nmap/tlsx/semgrep）
- ✅ OAST回调支持
- ✅ 跨角色访问对比
- ✅ 完整的可观测性和成本追踪

### 路线图明确的优先级

**P0（立即）**:
1. Playwright浏览器runner + 截图/trace
2. 卡住/循环监督器 + 建议事件
3. Scenario/scorer fixture用于Worker回归测试
4. Nuclei JSONL解析器（安全模板白名单）

**P1（短期）**:
1. Semgrep SARIF强化 + SCA/SBOM导入
2. Prowler/云态势导入
3. K8s/容器manifest和扫描导入
4. AI-Infra-Guard/promptfoo/PyRIT结果导入

**P2（中期）**:
1. DefectDojo风格的product/engagement/test/finding实例/retest记录
2. 关系型存储 + 迁移 + RBAC
3. 团队协作和审核员分配

### 从参考项目学到的关键模式

**来自高星项目的洞察**:
- **promptfoo (21.8k⭐)**: 声明式eval + CI/CD + 可报告的结果矩阵
- **PentAGI (17.4k⭐)**: Docker隔离 + 长运行任务状态 + 导师干预
- **PentestGPT (13.4k⭐)**: XBOW基准套件 + 会话恢复
- **HexStrike (9.2k⭐)**: 大型工具目录但需要治理（不应直接暴露150+工具）
- **Z3r0 (267⭐)**: 受控多智能体工作台 + Docker沙箱 + 持久化时间线

**应该复制的**:
- 基准和评分系统证明Worker质量
- 真实浏览器/代理/桌面runner（JS执行、会话处理、trace捕获）
- 成熟的类型化适配器（而非只是元数据）
- 循环/卡住监督器（检测无效重复）
- 内存层（区分run内存、跨run经验、工具知识、领域知识）
- 生产漏洞生命周期（去重、retest、engagement记录）

**不应该复制的**:
- ❌ Worker-to-Worker聊天或分布式图写入
- ❌ 绕过Tool Gateway的直接工具权限
- ❌ 将原始扫描器输出作为已确认finding
- ❌ 优化CTF成功而非证据级评估
- ❌ 默认发送敏感运行数据到远程可观测性服务

### 企业渗透测试角色规划

AgentRed应该暴露的**角色感知worker通道**（不是松散的聊天群）:

1. **Assessment Lead** - ROE、范围、停止条件、优先级
2. **Web/API Penetration Engineer** - 高影响web、API、GraphQL、OAuth、authz
3. **Cloud/Container Engineer** - IAM、存储、K8s、容器、CI/CD
4. **Identity Engineer** - AD/IAM/SSO/MFA/session路径
5. **AppSec/Supply Chain Engineer** - 源码、SAST、SCA、secrets、依赖可达性
6. **AI-Agent Security Engineer** - LLM app、MCP、skill、tool-call、prompt/tool注入
7. **Evidence Reviewer** - 验证、去重、置信度、报告就绪

所有角色仍然提交结构化建议。Dispatcher和Tool Gateway保持唯一的执行和状态转换权限。

### 高风险覆盖优先级

企业关键类别（优先于低价值加固输出）:

| 域 | 高风险类别 | 证据要求 |
|---|---|---|
| Web | SSRF、RCE、不安全反序列化、注入、文件上传、路径穿越、auth绕过 | HTTP交换 + 有界验证或建议/源证据 |
| API | BOLA/IDOR、BFLA、租户隔离失败、mass assignment、GraphQL resolver authz | baseline/对比角色证据 + access-review diff |
| OAuth/OIDC/SSO | redirect信任、state/nonce差距、client/audience不匹配、token暴露 | 已脱敏浏览器流 + 配置证据 + 截图 |
| Cloud | 公开存储、通配符IAM、PassRole/AssumeRole风险、暴露的管理服务 | 只读策略/清单证据 + 受影响的principal/resource |
| Container/K8s | 宽泛RBAC、特权workload、secret挂载、暴露的控制平面 | manifest/扫描证据 + namespace/serviceAccount/workload映射 |
| Identity | 高价值路径、风险委派、service account暴露、MFA/session绕过 | 身份图证据 + 访问策略/日志证据 + 操作员复核 |
| Supply chain | KEV/关键CVE可达性、暴露的secrets、CI/CD权限、artifact信任 | SBOM/SARIF/secret-scan证据，无原始secret值 |
| AI-agent infra | prompt/tool注入、不安全MCP权限、tool投毒、数据边界失败 | eval/扫描器证据关联到未授权tool/数据影响 |

## 待工作流完成后整合的关键问题

1. **MCP生态当前状态** - 有哪些安全MCP服务器？成熟度如何？
2. **竞品技术架构对比** - 主要玩家如何处理AI模型、工具集成、风险控制？
3. **2026年技术趋势** - AI能力演进方向？新兴架构模式？
4. **市场需求洞察** - 企业痛点？买家角色？差异化机会？
5. **具体优化方案** - 可落地的架构设计和代码示例

## 当前代码变更状态

已修改文件（550行新增）:
- `src/scanners/scanner-result-import-service.ts` (+222) - 多引擎支持
- `src/tools/tool-gateway.ts` (+33) - 自动解析7种扫描引擎
- `src/tools/toolbox-registry.ts` (+24) - 6个模板从planned→available
- `src/tools/toolbox-runner.ts` (+3)
- `src/domain/types.ts` (+2)
- `tests/platform.test.ts` (+287) - 新测试覆盖

新文件:
- `tests/nuclei-container.integration.test.ts` - 容器集成测试

测试状态: ✅ 75/83通过，8个跳过（需要容器环境）
构建状态: ✅ 成功，81个文件输出到dist/
类型检查: ✅ 通过

---

**下一步**: 等待工作流完成，然后生成综合的行业分析报告和优化路线图。
