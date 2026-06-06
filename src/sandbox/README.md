# AgentRed Sandbox Module

Docker-based sandbox isolation for secure external tool execution.

## Features

- **Container Isolation**: Run security tools in ephemeral Docker containers
- **Resource Limits**: CPU and memory constraints per execution
- **Network Policy**: Scope-based network isolation and DNS whitelisting
- **Security Hardening**: Non-root execution, dropped capabilities, no-new-privileges
- **Automatic Cleanup**: Containers are destroyed after execution
- **Transparent Integration**: Automatic fallback to process execution when disabled

## Quick Start

### 1. Build the Toolbox Image

```bash
cd docker
chmod +x build.sh
./build.sh
```

### 2. Enable Sandbox Mode

```bash
export PLATFORM_ENABLE_SANDBOX=1
export PLATFORM_SANDBOX_IMAGE=agentred-toolbox:latest
export PLATFORM_API_TOKEN=your-token
```

### 3. Start the Platform

```bash
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Toolbox Runner (Entry Point)          │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Sandbox Enabled?    │
         └──────┬───────────────┘
                │
       ┌────────┴────────┐
       │                 │
      Yes               No
       │                 │
       ▼                 ▼
┌──────────────┐   ┌──────────┐
│   Sandbox    │   │ Process  │
│   Toolbox    │   │ Execution│
│   Runner     │   │ (Legacy) │
└──────┬───────┘   └──────────┘
       │
       ▼
┌──────────────────┐
│  Sandbox Runtime │
│    (Docker)      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Docker Engine   │
└──────────────────┘
```

## Components

### SandboxRuntime (`src/sandbox/sandbox-runtime.ts`)
- Abstract interface for container runtimes
- Registry for runtime discovery
- Supports Docker, Podman, Kata, Process

### DockerRuntime (`src/sandbox/docker-runtime.ts`)
- Docker implementation
- Container lifecycle management
- Stream-based I/O
- Timeout enforcement

### NetworkPolicy (`src/sandbox/network-policy.ts`)
- Converts ScopePolicy to network rules
- Generates iptables rules
- Docker network configuration

### SandboxToolboxRunner (`src/sandbox/sandbox-toolbox-runner.ts`)
- High-level integration
- Automatic cleanup
- Scope-aware execution

## Usage

### Via Toolbox Runner (Recommended)

```typescript
import { ToolboxRunner } from './tools/toolbox-runner.js';

const runner = new ToolboxRunner(store, graph, events);

const decision = await runner.planTemplate({
  templateId: 'web.nuclei.safe_templates',
  target: 'https://example.com',
  riskLevel: 'R2',
  timeoutMs: 30000,
});

if (decision.allowed) {
  const result = await runner.executePlan(
    decision.plan,
    toolCallId,
    scopePolicy
  );
  console.log(result.stdout);
}
```

### Direct Sandbox Usage

```typescript
import { sandboxToolboxRunner } from './sandbox/sandbox-toolbox-runner.js';

const result = await sandboxToolboxRunner.run(
  {
    templateId: 'web.nuclei.safe_templates',
    target: 'https://example.com',
    timeoutMs: 30000,
    scopePolicy: run.scopePolicy,
    image: 'agentred-toolbox:latest',
    cpuLimit: '1.0',
    memoryLimit: '512m',
  },
  ['nuclei'],
  ['-u', 'https://example.com', '-severity', 'high', '-jsonl']
);
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLATFORM_ENABLE_SANDBOX` | Enable sandbox mode | `0` (disabled) |
| `PLATFORM_SANDBOX_RUNTIME` | Preferred runtime | `docker` |
| `PLATFORM_SANDBOX_IMAGE` | Default toolbox image | `ghcr.io/coff0xc/agentred-toolbox:latest` |
| `PLATFORM_CONTAINER_RUNTIME` | Legacy: runtime preference | `docker` |

### Runtime Selection

Runtimes are tried in this order:
1. `PLATFORM_SANDBOX_RUNTIME` (if set)
2. `docker`
3. `podman`
4. `kata`
5. `process` (no isolation)

## Security

### Container Hardening

All containers run with:
- `--cpus 1.0` - CPU limit
- `--memory 512m` - Memory limit
- `--network none|bridge` - Network isolation
- `--security-opt no-new-privileges` - Prevent privilege escalation
- `--cap-drop ALL` - Drop all Linux capabilities
- `--user agentred` - Non-root user (UID 1000)

### Network Isolation

Network mode is determined by ScopePolicy:
- **No allowed assets**: `--network none` (complete isolation)
- **Allowed assets**: `--network bridge` with DNS restrictions
- **Denied assets**: Blocked before execution

### Resource Limits

Default limits (configurable per execution):
- CPU: 1.0 core
- Memory: 512 MB
- Timeout: Template-specific (10-30s)

## Testing

### Unit Tests

```bash
npm test tests/sandbox.test.ts
```

Tests:
- Runtime availability
- Container lifecycle
- Timeout enforcement
- Network isolation
- Resource limits
- Security constraints

### Integration Tests

```bash
npm run test:integration tests/sandbox-integration.test.ts
```

Tests:
- End-to-end execution
- Scope-based policies
- Multi-container scenarios
- Cleanup verification

### Manual Testing

```bash
# Enable sandbox mode
export PLATFORM_ENABLE_SANDBOX=1
export PLATFORM_API_TOKEN=test-token

# Test with Docker
docker run --rm agentred-toolbox:latest echo "test"

# Start platform
npm run dev
```

## Troubleshooting

### Docker Not Available

**Symptom**: `No sandbox runtime available`

**Solution**: 
```bash
# Check Docker
docker --version

# Or install Docker
curl -fsSL https://get.docker.com | sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Image Not Found

**Symptom**: `Failed to create Docker sandbox: image not found`

**Solution**:
```bash
cd docker
./build.sh
```

### Permission Denied

**Symptom**: `permission denied while trying to connect to Docker daemon`

**Solution**:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Network Isolation Not Working

**Check**:
```bash
docker inspect <container-id> | grep NetworkMode
```

Should be `none` for no-network scenarios.

## Performance

### Overhead

Per container:
- Memory: ~50-100 MB base + tool memory
- CPU: <5% overhead
- Startup: ~1-2 seconds
- Cleanup: ~1-2 seconds

### Optimization

1. **Pre-pull images**:
   ```bash
   docker pull agentred-toolbox:latest
   ```

2. **Use `--network none` when possible** (faster)

3. **Adjust limits based on workload**:
   ```typescript
   cpuLimit: '0.5'
   memoryLimit: '256m'
   ```

## Roadmap

- [ ] Podman runtime implementation
- [ ] Kata Containers support
- [ ] Network proxy for fine-grained filtering
- [ ] Volume mounting for artifact access
- [ ] Container reuse for performance
- [ ] Image vulnerability scanning
- [ ] Detailed audit logging

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [OWASP Container Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
