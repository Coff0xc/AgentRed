# Contributing

Thanks for helping make this platform safer and more useful.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Keep changes focused and preserve the local-first security model:

- no raw secrets in run state, evidence, worker envelopes, reports, logs, or screenshots
- no direct external tool execution outside Tool Gateway and toolbox policy
- no active testing without scope, risk, approval, audit, and rate-limit gates
- no broad refactors when a local fix is enough

## Pull Request Checklist

- tests pass locally
- new security-sensitive behavior has a focused test
- docs are updated when API or operator workflow changes
- generated output, local state, logs, and secrets are not committed
