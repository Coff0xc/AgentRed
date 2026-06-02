# Security Policy

This project is for authorized security testing, defensive validation, and local evidence workflows only.

## Supported Versions

The `main` branch is the active development line. Security fixes should be applied there first.

## Reporting A Vulnerability

Please do not open a public issue with exploit details, live credentials, customer data, or private target information.

Send a minimal report to the repository maintainer with:

- affected component or route
- impact and trigger conditions
- local reproduction notes
- relevant commit or version
- suggested mitigation, if known

## Handling Secrets

Do not commit `.local/`, `.env*`, HAR files, logs, database files, browser profiles, certificates, private keys, or raw evidence exports. Worker API keys must be provided through the local API process environment, not through `workerPool.env` or the Operator Console.

## Scope Boundary

Do not use this project to test systems without explicit authorization. Active network checks must remain bound to a run `ScopePolicy`, risk level, approval status, and rate limit.
