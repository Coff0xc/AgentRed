# Publishing Checklist

Use this checklist before pushing or making the repository public.

## Required Checks

```bash
npm audit
npm run typecheck
npm test
npm run build
```

## Never Commit

- `.local/`
- `node_modules/`
- `dist/`
- `.env*`
- `*.db`, `*.sqlite`, `*.sqlite3`
- `*.log`
- `*.har`
- private keys, certificates, browser profiles, screenshots with private data

## GitHub Repository Settings

Recommended About fields:

- Description: `AI red team workbench for scoped testing and evidence-driven reporting. / 面向范围授权测试与证据化报告的 AI 红队工作台。`
- Topics: `authorized-security`, `ai-security`, `pentest`, `bug-bounty`, `red-team`, `typescript`, `evidence`
- Visibility: start as private until a maintainer has reviewed local state and release notes

Recommended branch protection:

- protect `main`
- require CI to pass
- require pull request review for security-sensitive changes
