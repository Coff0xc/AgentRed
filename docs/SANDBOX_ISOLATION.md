# Docker Sandbox Isolation

This document describes the Docker sandbox isolation implementation for AgentRed, achieving PentAGI-level container security for external tool execution.

## Overview

The sandbox runtime provides secure, isolated execution environments for external security tools like nuclei, nmap, httpx, and sqlmap. All external tools run in ephemeral Docker containers with:

- CPU and memory limits
- Network isolation based on ScopePolicy
- Non-root user execution
- No privileged access
- Automatic cleanup

## Architecture

### Components

1. **SandboxRuntime** (`src/sandbox/sandbox-runtime.ts`)
   - Abstract interface for container runtimes
   - Supports Docker, Podman, Kata, and process isolation
   - Registry for runtime discovery and selection

2. **DockerRuntime** (`src/sandbox/docker-runtime.ts`)
   - Docker implementation of SandboxRuntime
   - Container lifecycle management
   - Stream-based I/O handling
   - Timeout enforcement

3. **NetworkPolicy** (`src/sandbox/network-policy.ts`)
   - Converts ScopePolicy to network rules
   - Generates iptables rules
   - Configures Docker network isolation
   - DNS whitelist management

4. **SandboxToolboxRunner** (`src/sandbox/sandbox-toolbox-runner.ts`)
   - High-level integration with toolbox system
   - Automatic runtime selection
   - Lifecycle management
   - Scope-aware network configuration

5. **Toolbox Integration** (`src/tools/toolbox-runner.ts`)
   - Transparent sandbox mode switching
   - Fallback to process execution
   - Backward compatible API

## Security Model

### Container Hardening

All sandboxed containers are created with:

```typescript
--cpus 1.0                    // CPU limit
--memory 512m                 // Memory limit
--network none|bridge         // Network isolation
--security-opt no-new-privileges
--cap-drop ALL                // Drop all capabilities
--user agentred              // Non-root user (UID 1000)
```

### Network Isolation

Network access is controlled by ScopePolicy:

- **No allowed assets**: `--network none` (complete isolation)
- **Allowed assets**: `--network bridge` with DNS restrictions
- **Denied assets**: Explicitly blocked at gateway level

### Resource Limits

Default limits (configurable):
- CPU: 1.0 core
- Memory: 512 MB
- Timeout: Per-template (10-30 seconds)

## Pre-built Security Image

### Building the Image

```bash
cd docker
docker build -f agentred-toolbox.Dockerfile -t agentred-toolbox:latest .
```

### Image Contents

The `agentred-toolbox` image includes:

- Alpine Linux 3.19 (minimal base)
- nuclei 3.2.0
- httpx 1.6.0
- ffuf 2.1.0
- sqlmap (latest)
- nmap with scripts
- curl, wget, bind-tools

### Security Hardening

The image has:
- No `su`, `sudo`, or `passwd` commands
- Non-root user (agentred, UID 1000)
- Read-only critical directories
- No shell history or cache files

## Environment Variables

### Enable Sandbox Mode

```bash
# Required: Enable sandbox execution
PLATFORM_ENABLE_SANDBOX=1

# Optional: Override default runtime (docker|podman)
PLATFORM_SANDBOX_RUNTIME=docker

# Optional: Override default image
PLATFORM_SANDBOX_IMAGE=ghcr.io/coff0xc/agentred-toolbox:latest

# Optional: Container runtime (if using toolbox-runner legacy mode)
PLATFORM_CONTAINER_RUNTIME=docker
```

### Backward Compatibility

Existing environment variables still work:
```bash
PLATFORM_ENABLE_CONTAINER_TOOLBOX=1
PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1
```

## Usage

### Automatic Mode

When `PLATFORM_ENABLE_SANDBOX=1` is set, the toolbox runner automatically uses sandbox mode for external tools:

```typescript
const runner = new ToolboxRunner(store, graph, events);

// Plan template execution
const decision = await runner.planTemplate({
  templateId: 'web.nuclei.safe_templates',
  target: 'https://example.com',
  riskLevel: 'R2',
  timeoutMs: 30000,
});

if (decision.allowed) {
  // Execute in sandbox (automatic if enabled)
  const result = await runner.executePlan(decision.plan, toolCallId, scopePolicy);
  console.log(result.stdout);
}
```

### Manual Mode

Direct sandbox usage:

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

console.log(`Exit code: ${result.exitCode}`);
console.log(`Output: ${result.stdout}`);
```

## Testing

### Unit Tests

```bash
npm test tests/sandbox.test.ts
```

Tests:
- Runtime availability checks
- Container lifecycle (create, execute, destroy)
- Timeout enforcement
- Network isolation
- Resource limits
- Security constraints

### Integration Tests

```bash
npm run test:integration tests/sandbox-integration.test.ts
```

Tests:
- End-to-end toolbox execution
- Scope-based network policies
- Multi-container scenarios
- Cleanup verification

### Manual Testing

```bash
# Enable sandbox mode
export PLATFORM_ENABLE_SANDBOX=1
export PLATFORM_API_TOKEN=test-token

# Start platform
npm run dev

# Create a run with nuclei template
curl -X POST http://localhost:4317/runs \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://example.com",
    "goal": "Test sandbox execution",
    "scopePolicy": {
      "allowedAssets": ["example.com"],
      "deniedAssets": [],
      "allowedMethods": ["GET", "POST"],
      "destructiveAllowed": false,
      "credentialRules": {
        "allowSessionMaterial": false,
        "allowApiKeys": false
      }
    }
  }'

# Execute scanner template in sandbox
curl -X POST http://localhost:4317/runs/{runId}/tools \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "scanner.run_template",
    "templateId": "web.nuclei.safe_templates",
    "target": "https://example.com",
    "riskLevel": "R2"
  }'
```

## Deployment

### Prerequisites

1. Docker or Podman installed
2. User has permission to run Docker commands
3. At least 1GB RAM available
4. Network access to pull base images

### Production Setup

```bash
# 1. Build or pull the toolbox image
docker pull ghcr.io/coff0xc/agentred-toolbox:latest

# OR build locally
cd docker
docker build -f agentred-toolbox.Dockerfile -t agentred-toolbox:latest .

# 2. Configure environment
export PLATFORM_ENABLE_SANDBOX=1
export PLATFORM_SANDBOX_IMAGE=agentred-toolbox:latest
export PLATFORM_API_TOKEN=<secure-token>

# 3. Start the platform
npm run build
node dist/index.js
```

### Health Checks

```bash
# Check Docker availability
docker --version

# Verify image exists
docker images | grep agentred-toolbox

# Test sandbox creation
docker run --rm agentred-toolbox:latest echo "sandbox ready"
```

## Performance

### Resource Overhead

Per sandbox container:
- Memory: ~50-100 MB base + tool memory
- CPU: Minimal overhead (<5%)
- Startup time: ~1-2 seconds per container
- Cleanup time: ~1-2 seconds per container

### Optimization Tips

1. **Image Pre-pulling**: Pull images before first use
   ```bash
   docker pull agentred-toolbox:latest
   ```

2. **Container Reuse** (future): Keep containers warm between executions

3. **Network Mode**: Use `none` when no network needed (faster)

4. **Resource Tuning**: Adjust limits based on workload
   ```typescript
   cpuLimit: '0.5'    // For light scanning
   memoryLimit: '256m' // For simple tools
   ```

## Troubleshooting

### Docker Not Available

```
Error: No sandbox runtime available. Docker or Podman required.
```

**Solution**: Install Docker or set `PLATFORM_ENABLE_SANDBOX=0` to disable.

### Permission Denied

```
Error: Failed to create Docker sandbox: permission denied
```

**Solution**: Add user to `docker` group:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Container Creation Fails

```
Error: Failed to create Docker sandbox: image not found
```

**Solution**: Pull or build the image:
```bash
docker pull agentred-toolbox:latest
```

### Network Isolation Issues

If sandboxed tools can access blocked hosts:

1. Check ScopePolicy configuration
2. Verify network mode: `docker inspect <container-id> | grep NetworkMode`
3. Test with `--network none` explicitly

### Memory Limits Exceeded

```
Error: Container killed (OOM)
```

**Solution**: Increase memory limit:
```typescript
memoryLimit: '1024m' // or higher
```

## Future Enhancements

1. **Podman Support**: Full Podman runtime implementation
2. **Kata Containers**: Hardware-level isolation for sensitive operations
3. **Network Proxy**: Fine-grained URL filtering within containers
4. **Artifact Volumes**: Safe mounting of evidence files
5. **Multi-container Orchestration**: Parallel execution with resource pooling
6. **Image Scanning**: Vulnerability scanning of toolbox images
7. **Audit Logging**: Detailed container execution logs

## Security Considerations

### Threat Model

Sandboxing protects against:
- ✅ Tool compromise (malicious tool behavior)
- ✅ Unintended network access
- ✅ Resource exhaustion attacks
- ✅ Container escape via privilege escalation
- ✅ Data exfiltration via network

Does NOT protect against:
- ❌ Docker daemon compromise (host-level attack)
- ❌ Kernel exploits (requires Kata containers)
- ❌ Side-channel attacks (timing, cache)

### Best Practices

1. **Keep Docker Updated**: Regularly update Docker daemon
2. **Scan Images**: Scan toolbox images for vulnerabilities
3. **Audit Logs**: Monitor Docker events and container activity
4. **Resource Monitoring**: Track container resource usage
5. **Network Segmentation**: Run Docker on isolated network
6. **Minimal Images**: Keep toolbox image as small as possible
7. **Secrets Management**: Never pass secrets via environment variables

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [PentAGI Architecture](https://github.com/GreyDGL/PentestGPT) (inspiration)
- [OWASP Container Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
