# WebSocket Real-Time Push - Evidence & Finding Notifications

## 概述

AgentRed 平台支持通过 WebSocket 实时推送 Evidence 和 Finding 事件通知。客户端可以订阅特定 Run 的进度更新，实时接收证据创建、漏洞发现、验证状态变更等事件。

## 核心特性

### 安全边界

- **只读推送**：WebSocket 只推送只读事件数据，不能写入状态
- **Token 认证**：要求 Token 认证才能建立连接
- **不暴露敏感内容**：不暴露原始证据内容（raw-local-only）
- **连接失败不影响持久化**：WebSocket 广播失败不影响 RunEvent 的持久化

### 支持的事件类型

#### Evidence 相关事件

- `evidence.added` - 证据创建时触发
  - 包含证据 ID、类型（kind）、SHA-256 哈希
  - 不包含原始证据内容（需要通过 REST API 读取）

#### Finding 相关事件

- `finding.proposed` - 漏洞提出时触发
  - 包含漏洞 ID、标题、严重程度、置信度
  - 包含关联的证据 ID 列表

- `finding.validated` - 漏洞验证状态变更时触发
  - 包含验证状态（candidate/confirmed/rejected）
  - 包含验证备注和验证人信息

#### 其他事件

- `connection.established` - 连接建立确认
- `fact.added` - 事实添加
- `intent.created` / `intent.claimed` / `intent.concluded` - 意图状态变更
- `tool.allowed` / `tool.blocked` - 工具调用结果
- `approval.requested` / `approval.decided` - 审批请求和决策
- 更多事件类型见 `RunEventType` 定义

## 连接方式

### WebSocket 端点

```
ws://127.0.0.1:4317/ws/progress?runId={runId}&token={token}
```

### 参数说明

- `runId` (必需) - 要订阅的 Run ID
- `token` (必需) - 平台 API Token（与 REST API 认证相同）

### 认证方式

支持三种认证方式（任选其一）：

1. **查询参数**：`?token=your-token`
2. **自定义头**：`X-Platform-Token: your-token`
3. **Bearer Token**：`Authorization: Bearer your-token`

## 消息格式

### 连接确认消息

```json
{
  "type": "connection.established",
  "runId": "run_abc123",
  "timestamp": "2026-06-06T10:00:00.000Z",
  "data": {
    "heartbeatIntervalMs": 30000,
    "idleTimeoutMs": 1800000
  }
}
```

### Evidence 事件消息

```json
{
  "type": "evidence.added",
  "runId": "run_abc123",
  "timestamp": "2026-06-06T10:01:23.456Z",
  "data": {
    "id": "event_xyz789",
    "title": "Evidence added",
    "detail": "http_exchange a1b2c3d4e5f6...",
    "level": "info",
    "entityId": "evidence_def456"
  }
}
```

### Finding 事件消息

```json
{
  "type": "finding.proposed",
  "runId": "run_abc123",
  "timestamp": "2026-06-06T10:05:00.123Z",
  "data": {
    "id": "event_xyz790",
    "title": "Finding proposed",
    "detail": "high: SQL Injection in /api/users",
    "level": "info",
    "entityId": "finding_ghi789"
  }
}
```

### Finding 验证消息

```json
{
  "type": "finding.validated",
  "runId": "run_abc123",
  "timestamp": "2026-06-06T10:10:00.456Z",
  "data": {
    "id": "event_xyz791",
    "title": "Finding validation updated",
    "detail": "confirmed: SQL Injection in /api/users - Verified by operator",
    "level": "info",
    "entityId": "finding_ghi789"
  }
}
```

## 客户端示例

### JavaScript/TypeScript (Node.js)

```typescript
import WebSocket from 'ws';

const runId = 'run_abc123';
const token = 'your-platform-token';

const ws = new WebSocket(
  `ws://127.0.0.1:4317/ws/progress?runId=${runId}&token=${token}`
);

ws.on('open', () => {
  console.log('WebSocket connected');
});

ws.on('message', (data: Buffer) => {
  const message = JSON.parse(data.toString());
  
  switch (message.type) {
    case 'connection.established':
      console.log('Connection established:', message.data);
      break;
      
    case 'evidence.added':
      console.log('New evidence:', message.data.entityId);
      // 通过 REST API 获取完整证据详情
      // GET /evidence/{entityId}/content
      break;
      
    case 'finding.proposed':
      console.log('New finding:', message.data.detail);
      // 通过 REST API 获取完整漏洞详情
      // GET /findings?runId={runId}
      break;
      
    case 'finding.validated':
      console.log('Finding validated:', message.data.detail);
      break;
      
    default:
      console.log('Event:', message.type, message.data);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed:', code, reason.toString());
});

// 保持连接活跃（响应心跳）
ws.on('ping', () => {
  ws.pong();
});
```

### JavaScript (浏览器)

```javascript
const runId = 'run_abc123';
const token = 'your-platform-token';

const ws = new WebSocket(
  `ws://127.0.0.1:4317/ws/progress?runId=${runId}&token=${token}`
);

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'evidence.added') {
    updateEvidenceList(message.data.entityId);
  } else if (message.type === 'finding.proposed') {
    showNewFindingNotification(message.data.detail);
  } else if (message.type === 'finding.validated') {
    updateFindingStatus(message.data.entityId, message.data.detail);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  console.log('WebSocket closed:', event.code, event.reason);
};
```

### Python

```python
import websocket
import json

def on_message(ws, message):
    data = json.loads(message)
    
    if data['type'] == 'evidence.added':
        print(f"New evidence: {data['data']['entityId']}")
    elif data['type'] == 'finding.proposed':
        print(f"New finding: {data['data']['detail']}")
    elif data['type'] == 'finding.validated':
        print(f"Finding validated: {data['data']['detail']}")
    else:
        print(f"Event: {data['type']}")

def on_error(ws, error):
    print(f"Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print(f"Connection closed: {close_status_code} {close_msg}")

def on_open(ws):
    print("WebSocket connected")

if __name__ == "__main__":
    run_id = "run_abc123"
    token = "your-platform-token"
    
    ws = websocket.WebSocketApp(
        f"ws://127.0.0.1:4317/ws/progress?runId={run_id}&token={token}",
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    
    ws.run_forever()
```

## 连接管理

### 心跳机制

- 服务器每 30 秒发送一次 `ping` 帧
- 客户端应响应 `pong` 帧以保持连接活跃
- 如果客户端不响应心跳，连接将被服务器终止

### 空闲超时

- 默认空闲超时：30 分钟
- 超过空闲时间没有活动，连接将被自动关闭
- 客户端应处理重连逻辑

### 错误处理

- **1008 - Policy Violation**：缺少必需参数或认证失败
- **1000 - Normal Closure**：正常关闭
- **1001 - Going Away**：服务器关闭

### 重连策略

```typescript
function connectWithRetry(runId: string, token: string, maxRetries = 5) {
  let retryCount = 0;
  let ws: WebSocket;
  
  function connect() {
    ws = new WebSocket(
      `ws://127.0.0.1:4317/ws/progress?runId=${runId}&token=${token}`
    );
    
    ws.on('open', () => {
      retryCount = 0;
      console.log('WebSocket connected');
    });
    
    ws.on('close', (code) => {
      if (code === 1008) {
        console.error('Authentication or parameter error - not retrying');
        return;
      }
      
      if (retryCount < maxRetries) {
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        console.log(`Reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
        setTimeout(connect, delay);
      } else {
        console.error('Max retries reached');
      }
    });
    
    ws.on('message', handleMessage);
    ws.on('error', (error) => console.error('WebSocket error:', error));
  }
  
  connect();
  return () => ws?.close();
}
```

## 使用场景

### 实时控制台

实时显示证据收集和漏洞发现进度：

```typescript
const evidenceCount = { total: 0 };
const findingCount = { candidate: 0, confirmed: 0 };

ws.on('message', (data: Buffer) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === 'evidence.added') {
    evidenceCount.total++;
    updateDashboard({ evidence: evidenceCount.total });
  } else if (message.type === 'finding.proposed') {
    findingCount.candidate++;
    updateDashboard({ findings: findingCount });
  } else if (message.type === 'finding.validated') {
    if (message.data.detail.includes('confirmed')) {
      findingCount.candidate--;
      findingCount.confirmed++;
      updateDashboard({ findings: findingCount });
    }
  }
});
```

### 桌面通知

在发现重要漏洞时发送系统通知：

```typescript
ws.on('message', (data: Buffer) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === 'finding.proposed') {
    const severity = message.data.detail.split(':')[0];
    if (severity === 'critical' || severity === 'high') {
      showDesktopNotification(
        'High Risk Finding Detected',
        message.data.detail
      );
    }
  }
});
```

### 多Run监控

同时监控多个测试任务：

```typescript
const runs = ['run_abc123', 'run_def456', 'run_ghi789'];
const connections = runs.map(runId => {
  const ws = new WebSocket(
    `ws://127.0.0.1:4317/ws/progress?runId=${runId}&token=${token}`
  );
  
  ws.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString());
    updateRunStatus(runId, message);
  });
  
  return ws;
});
```

## 性能考虑

### 消息过滤

如果只关心特定类型的事件，可以在客户端过滤：

```typescript
const relevantTypes = ['evidence.added', 'finding.proposed', 'finding.validated'];

ws.on('message', (data: Buffer) => {
  const message = JSON.parse(data.toString());
  
  if (!relevantTypes.includes(message.type)) {
    return; // 忽略不相关的事件
  }
  
  handleMessage(message);
});
```

### 批量处理

对于高频事件，可以批量处理：

```typescript
const messageQueue: any[] = [];
let processingTimer: NodeJS.Timeout;

ws.on('message', (data: Buffer) => {
  const message = JSON.parse(data.toString());
  messageQueue.push(message);
  
  clearTimeout(processingTimer);
  processingTimer = setTimeout(() => {
    processBatch(messageQueue.splice(0));
  }, 500); // 每500ms批量处理一次
});
```

## 故障排查

### 连接被拒绝

- 检查 `runId` 是否有效
- 检查 `token` 是否正确
- 确认 WebSocket 在服务器上已启用（`enableWebSocket: true`）

### 未收到消息

- 检查是否订阅了正确的 `runId`
- 确认 WebSocket 服务器已连接到 RunEventService（`platform.events.wsServer`）
- 检查服务器日志中的错误

### 连接频繁断开

- 确认客户端正确响应心跳 `ping/pong`
- 检查网络稳定性
- 实现重连逻辑

## 安全最佳实践

1. **Token 保护**：不要在客户端代码中硬编码 Token
2. **HTTPS/WSS**：生产环境使用加密连接
3. **最小权限**：每个客户端只订阅需要的 Run
4. **日志脱敏**：不要记录完整的 Token 或敏感证据内容
5. **连接限制**：避免创建过多并发连接

## 参考

- [Progress WebSocket Server Implementation](../src/events/progress-websocket-server.ts)
- [RunEventService Integration](../src/events/run-event-service.ts)
- [WebSocket Tests](../tests/websocket.test.ts)
- [Evidence & Finding WebSocket Tests](../tests/websocket-evidence-finding.test.ts)
- [RunEventType Definitions](../src/domain/types.ts)
