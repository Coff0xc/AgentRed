import type { EvidenceKind, RiskLevel } from '../domain/types.js';

export type ToolboxProfileStatus = 'available' | 'unavailable' | 'planned';
export type ToolboxProfileKind = 'builtin' | 'local' | 'container' | 'mobile' | 'sast';
export type ScannerTemplateDomain = 'web' | 'network' | 'sast' | 'mobile';
export type ScannerTemplateExecutionMode = 'builtin' | 'external';
export type CapabilityArea = 'web' | 'network' | 'auth' | 'oast' | 'sast' | 'mobile' | 'cloud' | 'identity' | 'platform';
export type CapabilityStatus = 'available' | 'partial' | 'planned';
export type ToolboxBundleStatus = 'available' | 'partial' | 'planned' | 'unavailable';
export type ToolboxBundleSource = 'built_in' | 'container_image' | 'local_runtime' | 'mobile_lab' | 'local_manifest';

export interface ToolboxProfile {
  id: string;
  name: string;
  kind: ToolboxProfileKind;
  status: ToolboxProfileStatus;
  isolation: 'process' | 'container' | 'device';
  description: string;
  commands: string[];
  limitations: string[];
}

export interface ToolTemplateProfile {
  id: string;
  name: string;
  description: string;
  domain: ScannerTemplateDomain;
  engine: string;
  profileId: string;
  executionMode: ScannerTemplateExecutionMode;
  adapterStatus: ToolboxProfileStatus;
  defaultRiskLevel: RiskLevel;
  evidenceKind: Extract<EvidenceKind, 'http_exchange' | 'command_output'>;
  riskNotes: string[];
}

export interface ScannerTemplatePolicy {
  templateId: string;
  defaultRiskLevel: RiskLevel;
  allowedRiskLevels: RiskLevel[];
  requiresApproval: boolean;
  maxTimeoutMs: number;
  executionMode: ScannerTemplateExecutionMode;
  profileId: string;
  engine: string;
  externalExecutionFailClosed: boolean;
  inputPolicy: string[];
  executionControls: string[];
  evidencePolicy: string[];
  operatorNotes: string[];
}

export interface ToolCatalogEntry {
  name: string;
  category: 'browser' | 'proxy' | 'http' | 'scanner' | 'shell' | 'evidence' | 'finding' | 'credential' | 'access' | 'oast';
  description: string;
  defaultRiskLevel: RiskLevel;
  requiresApproval: boolean;
  producesEvidence: boolean;
  templates: ToolTemplateProfile[];
}

export interface CapabilityMatrixEntry {
  area: CapabilityArea;
  name: string;
  status: CapabilityStatus;
  highLevelTools: string[];
  scannerTemplates: string[];
  profiles: string[];
  engines: string[];
  evidenceKinds: string[];
  riskLevels: RiskLevel[];
  safetyControls: string[];
  gaps: string[];
}

export interface ToolboxBundle {
  id: string;
  name: string;
  version: string;
  source: ToolboxBundleSource;
  status: ToolboxBundleStatus;
  profileIds: string[];
  engines: string[];
  templateIds: string[];
  riskLevels: RiskLevel[];
  safetyNotes: string[];
  installationNotes: string[];
  commercialUseCases: string[];
}

export const TOOLBOX_PROFILES: ToolboxProfile[] = [
  {
    id: 'builtin.web',
    name: 'Built-in Web Checks',
    kind: 'builtin',
    status: 'available',
    isolation: 'process',
    description: 'Safe bounded HTTP checks implemented inside the local kernel.',
    commands: [],
    limitations: ['HTTP fetch based checks only', 'No JavaScript browser execution', 'No TLS MITM'],
  },
  {
    id: 'builtin.network',
    name: 'Built-in Network Checks',
    kind: 'builtin',
    status: 'available',
    isolation: 'process',
    description: 'Safe bounded DNS and TLS metadata checks implemented inside the local kernel.',
    commands: [],
    limitations: ['No port scanning', 'No packet capture', 'No raw socket fuzzing'],
  },
  {
    id: 'container.web-recon',
    name: 'Container Web Recon Toolbox',
    kind: 'container',
    status: 'planned',
    isolation: 'container',
    description: 'Future Docker/Podman toolbox for nuclei, ffuf, httpx, and sqlmap adapters.',
    commands: ['nuclei', 'ffuf', 'httpx', 'sqlmap'],
    limitations: ['Requires container runtime integration', 'R3 templates still require approval'],
  },
  {
    id: 'container.network-recon',
    name: 'Container Network Recon Toolbox',
    kind: 'container',
    status: 'planned',
    isolation: 'container',
    description: 'Future Docker/Podman toolbox for nmap, naabu, dnsx, tlsx, and httpx adapters.',
    commands: ['nmap', 'naabu', 'dnsx', 'tlsx', 'httpx'],
    limitations: ['Requires container runtime integration', 'Scanning templates require scope and rate policy'],
  },
  {
    id: 'local.sast',
    name: 'Local SAST Toolbox',
    kind: 'sast',
    status: 'planned',
    isolation: 'process',
    description: 'Future source-code analysis toolbox for semgrep and dependency scanners.',
    commands: ['semgrep'],
    limitations: ['Requires a local workspace mount', 'No source upload by default'],
  },
  {
    id: 'mobile.android',
    name: 'Android Analysis Toolbox',
    kind: 'mobile',
    status: 'planned',
    isolation: 'container',
    description: 'Future Android APK and dynamic instrumentation toolbox.',
    commands: ['apktool', 'jadx', 'frida'],
    limitations: ['Requires APK import or a lab device', 'Dynamic Frida checks are approval-gated'],
  },
];

export const SCANNER_TEMPLATES: ToolTemplateProfile[] = [
  {
    id: 'web.security_headers',
    name: 'Web Security Headers',
    description: 'Fetch the target and record which common browser security headers are present or missing.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request'],
  },
  {
    id: 'web.endpoint_discovery',
    name: 'Web Endpoint Discovery',
    description: 'Check robots.txt, security.txt, and sitemap.xml on the target origin and store bounded previews.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['Four bounded in-scope HTTP requests to well-known paths'],
  },
  {
    id: 'web.technology_fingerprint',
    name: 'Web Technology Fingerprint',
    description: 'Collect response headers and bounded HTML signals for framework and platform hints.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request', 'Body preview is redacted and bounded'],
  },
  {
    id: 'web.cookie_flags',
    name: 'Web Cookie Flags',
    description: 'Inspect Set-Cookie metadata for Secure, HttpOnly, and SameSite coverage without storing cookie values.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Cookie values are never stored'],
  },
  {
    id: 'web.link_form_map',
    name: 'Web Link And Form Map',
    description: 'Extract bounded same-origin links and form actions from one HTML response.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Passive HTML parsing from one response', 'No form submission'],
  },
  {
    id: 'web.cors_policy',
    name: 'CORS Policy Review',
    description: 'Send one bounded GET with a synthetic Origin header and record CORS response policy signals.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request', 'No credential material is sent', 'Uses a synthetic Origin header only'],
  },
  {
    id: 'web.csp_analysis',
    name: 'Content Security Policy Analysis',
    description: 'Fetch one page and summarize CSP, frame, MIME, referrer, and permissions-policy hardening signals.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request', 'Body preview is not stored; only bounded policy metadata is stored'],
  },
  {
    id: 'web.js_asset_inventory',
    name: 'JavaScript Asset Inventory',
    description: 'Extract bounded script asset URLs, inline script counts, and source-map hints from one HTML response.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Passive HTML parsing from one response', 'Does not fetch JavaScript files', 'No source-map downloads'],
  },
  {
    id: 'web.cookie_scope_analysis',
    name: 'Cookie Scope Analysis',
    description: 'Inspect Set-Cookie scope, prefix, lifetime, and partitioning metadata without storing cookie values.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request', 'Cookie values are never stored', 'Domain and path scope are redacted and bounded'],
  },
  {
    id: 'web.security_txt_policy',
    name: 'Security.txt Policy Review',
    description: 'Check security.txt locations and summarize contact, policy, encryption, acknowledgments, and expiry metadata.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Two bounded same-origin well-known requests', 'Contact and policy URLs are redacted', 'No external contact URLs are fetched'],
  },
  {
    id: 'web.websocket_discovery_plan',
    name: 'WebSocket Discovery Plan',
    description: 'Extract WebSocket and realtime endpoint hints from one HTML response and produce a safe validation plan without connecting.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request', 'No WebSocket handshake is performed', 'No messages are sent'],
  },
  {
    id: 'web.sourcemap_exposure_plan',
    name: 'Source Map Exposure Plan',
    description: 'Check bounded source-map metadata with HEAD requests and produce a review plan without downloading map bodies.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Bounded same-origin HEAD requests only', 'No source-map bodies are downloaded', 'No JavaScript files are fetched'],
  },
  {
    id: 'web.redirect_policy',
    name: 'Redirect Policy Review',
    description: 'Fetch one target with redirects disabled and record Location, HSTS, and canonical redirect signals.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request', 'Does not follow redirect chains', 'Stores redacted Location metadata only'],
  },
  {
    id: 'web.cache_policy',
    name: 'Cache Policy Review',
    description: 'Fetch one page and summarize cache, CDN, validator, Vary, and sensitive-response caching signals.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One in-scope HTTP request', 'Response body is not stored', 'Only cache-related headers and signals are recorded'],
  },
  {
    id: 'web.openapi_discovery',
    name: 'OpenAPI Discovery',
    description: 'Check bounded same-origin OpenAPI and Swagger metadata paths and store redacted spec previews.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['Bounded same-origin GET requests to common metadata paths', 'No API operation execution', 'Spec previews are redacted and size-limited'],
  },
  {
    id: 'web.oauth_oidc_metadata',
    name: 'OAuth/OIDC Metadata Review',
    description: 'Check same-origin OAuth and OpenID Connect well-known metadata and record redacted issuer and endpoint hints.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Two bounded same-origin well-known metadata requests', 'No credential material or token exchange', 'Endpoint URLs are redacted'],
  },
  {
    id: 'web.graphql_introspection_plan',
    name: 'GraphQL Introspection Plan',
    description: 'Probe bounded GraphQL endpoint hints and produce an approval-aware introspection plan without running introspection queries.',
    domain: 'web',
    engine: 'builtin',
    profileId: 'builtin.web',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: [
      'Checks bounded same-origin GraphQL candidate paths only',
      'Does not send introspection queries or mutations',
      'Live introspection or authenticated probing remains approval-gated',
    ],
  },
  {
    id: 'network.dns_records',
    name: 'DNS Records Snapshot',
    description: 'Resolve bounded public DNS records for the in-scope target host and store normalized metadata.',
    domain: 'network',
    engine: 'builtin',
    profileId: 'builtin.network',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R0',
    evidenceKind: 'command_output',
    riskNotes: ['Passive DNS lookups only', 'No zone transfer'],
  },
  {
    id: 'network.tls_certificate',
    name: 'TLS Certificate Snapshot',
    description: 'Open one TLS handshake to the in-scope host and store certificate metadata without sending HTTP data.',
    domain: 'network',
    engine: 'builtin',
    profileId: 'builtin.network',
    executionMode: 'builtin',
    adapterStatus: 'available',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['One TLS handshake', 'No TLS interception'],
  },
  {
    id: 'web.nuclei.safe_templates',
    name: 'Nuclei Safe Templates',
    description: 'Planned nuclei adapter for curated low-risk templates behind scope, rate, and approval gates.',
    domain: 'web',
    engine: 'nuclei',
    profileId: 'container.web-recon',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['Requires container toolbox', 'Template allowlist required before execution'],
  },
  {
    id: 'web.httpx.fingerprint',
    name: 'HTTPX Surface Fingerprint',
    description: 'Planned httpx adapter for bounded HTTP service fingerprinting behind scope and rate gates.',
    domain: 'web',
    engine: 'httpx',
    profileId: 'container.web-recon',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['Requires container toolbox', 'No out-of-scope host expansion'],
  },
  {
    id: 'web.ffuf.content_discovery',
    name: 'FFUF Content Discovery',
    description: 'Planned ffuf adapter for bounded content discovery with rate limits and scope checks.',
    domain: 'web',
    engine: 'ffuf',
    profileId: 'container.web-recon',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['Requires explicit wordlist policy', 'No brute force outside authorized scope'],
  },
  {
    id: 'web.sqlmap.verify',
    name: 'SQLMap Verification',
    description: 'Planned sqlmap verification adapter for approved, narrow, evidence-backed checks.',
    domain: 'web',
    engine: 'sqlmap',
    profileId: 'container.web-recon',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R3',
    evidenceKind: 'command_output',
    riskNotes: ['Requires human approval', 'Only for explicitly authorized parameters'],
  },
  {
    id: 'network.nmap.safe_top_ports',
    name: 'Nmap Safe Top Ports',
    description: 'Planned nmap adapter for bounded top-port validation with strict scope and rate controls.',
    domain: 'network',
    engine: 'nmap',
    profileId: 'container.network-recon',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['Requires container toolbox', 'No UDP flood or intrusive scripts'],
  },
  {
    id: 'network.tlsx.bulk_certificate',
    name: 'TLSX Bulk Certificate Metadata',
    description: 'Planned tlsx adapter for certificate metadata collection across approved assets.',
    domain: 'network',
    engine: 'tlsx',
    profileId: 'container.network-recon',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R2',
    evidenceKind: 'command_output',
    riskNotes: ['Requires explicit approved asset input', 'No certificate interception'],
  },
  {
    id: 'sast.semgrep.baseline',
    name: 'Semgrep Baseline',
    description: 'Planned Semgrep adapter for local source-code SAST without uploading source to cloud.',
    domain: 'sast',
    engine: 'semgrep',
    profileId: 'local.sast',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Requires local workspace input', 'Findings must reference source evidence'],
  },
  {
    id: 'mobile.apk.manifest',
    name: 'APK Manifest Review',
    description: 'Planned apktool adapter for Android manifest and permission review.',
    domain: 'mobile',
    engine: 'apktool',
    profileId: 'mobile.android',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R1',
    evidenceKind: 'command_output',
    riskNotes: ['Requires APK artifact import'],
  },
  {
    id: 'mobile.frida.probe',
    name: 'Frida Dynamic Probe',
    description: 'Planned Frida adapter for lab-device runtime verification.',
    domain: 'mobile',
    engine: 'frida',
    profileId: 'mobile.android',
    executionMode: 'external',
    adapterStatus: 'planned',
    defaultRiskLevel: 'R3',
    evidenceKind: 'command_output',
    riskNotes: ['Requires human approval', 'Requires lab device or emulator'],
  },
];

export const TOOLBOX_BUNDLES: ToolboxBundle[] = [
  {
    id: 'bundle.builtin-web-kernel',
    name: 'Built-in Web Kernel',
    version: '0.1.0',
    source: 'built_in',
    status: 'available',
    profileIds: ['builtin.web'],
    engines: ['builtin'],
    templateIds: [
      'web.security_headers',
      'web.endpoint_discovery',
      'web.technology_fingerprint',
      'web.cookie_flags',
      'web.link_form_map',
      'web.cors_policy',
      'web.csp_analysis',
      'web.js_asset_inventory',
      'web.cookie_scope_analysis',
      'web.security_txt_policy',
      'web.websocket_discovery_plan',
      'web.sourcemap_exposure_plan',
      'web.redirect_policy',
      'web.cache_policy',
      'web.openapi_discovery',
      'web.oauth_oidc_metadata',
      'web.graphql_introspection_plan',
    ],
    riskLevels: ['R1', 'R2'],
    safetyNotes: [
      'Runs inside the local platform process.',
      'Uses bounded in-scope HTTP requests and stores redacted command_output evidence.',
      'Does not execute JavaScript, fuzz forms, or bypass the Tool Gateway.',
    ],
    installationNotes: ['Available by default with no external runtime.'],
    commercialUseCases: [
      'Bug bounty web baseline',
      'SRC evidence collection',
      'security-header and cookie review',
      'API and identity metadata triage',
    ],
  },
  {
    id: 'bundle.builtin-network-kernel',
    name: 'Built-in Network Kernel',
    version: '0.1.0',
    source: 'built_in',
    status: 'available',
    profileIds: ['builtin.network'],
    engines: ['builtin'],
    templateIds: ['network.dns_records', 'network.tls_certificate'],
    riskLevels: ['R0', 'R1'],
    safetyNotes: [
      'Performs passive DNS lookups and one TLS handshake only.',
      'Does not do port scanning, zone transfer, packet capture, or TLS interception.',
    ],
    installationNotes: ['Available by default with no external runtime.'],
    commercialUseCases: ['External attack-surface metadata', 'TLS certificate inventory', 'safe scope validation'],
  },
  {
    id: 'bundle.container-web-recon',
    name: 'Container Web Recon Bundle',
    version: '0.1.0',
    source: 'container_image',
    status: 'planned',
    profileIds: ['container.web-recon'],
    engines: ['nuclei', 'httpx', 'ffuf', 'sqlmap'],
    templateIds: [
      'web.nuclei.safe_templates',
      'web.httpx.fingerprint',
      'web.ffuf.content_discovery',
      'web.sqlmap.verify',
    ],
    riskLevels: ['R2', 'R3'],
    safetyNotes: [
      'External execution is fail-closed unless PLATFORM_ALLOW_EXTERNAL_TOOLBOX and profile gates are enabled.',
      'Wordlists and template packs must be allowlisted before use.',
      'R3 verification remains approval-gated even when the bundle is installed.',
    ],
    installationNotes: [
      'Requires Docker or Podman.',
      'Set PLATFORM_ENABLE_CONTAINER_TOOLBOX=1 and configure PLATFORM_WEB_RECON_IMAGE.',
    ],
    commercialUseCases: ['Curated web recon', 'nuclei template validation', 'bounded content discovery'],
  },
  {
    id: 'bundle.container-network-recon',
    name: 'Container Network Recon Bundle',
    version: '0.1.0',
    source: 'container_image',
    status: 'planned',
    profileIds: ['container.network-recon'],
    engines: ['nmap', 'tlsx'],
    templateIds: ['network.nmap.safe_top_ports', 'network.tlsx.bulk_certificate'],
    riskLevels: ['R2'],
    safetyNotes: [
      'Requires explicit scope and rate policy before scanning.',
      'No intrusive scripts, UDP flood, packet capture, or out-of-scope host expansion.',
    ],
    installationNotes: [
      'Requires Docker or Podman.',
      'Set PLATFORM_ENABLE_CONTAINER_TOOLBOX=1 and configure PLATFORM_NETWORK_RECON_IMAGE.',
    ],
    commercialUseCases: ['Approved network reconnaissance', 'service validation', 'certificate metadata collection'],
  },
  {
    id: 'bundle.local-sast',
    name: 'Local SAST Bundle',
    version: '0.1.0',
    source: 'local_runtime',
    status: 'planned',
    profileIds: ['local.sast'],
    engines: ['semgrep'],
    templateIds: ['sast.semgrep.baseline'],
    riskLevels: ['R1'],
    safetyNotes: [
      'Runs against local source workspaces.',
      'Source code is not uploaded by default.',
      'Static results become candidate findings until human validation.',
    ],
    installationNotes: ['Set PLATFORM_ENABLE_LOCAL_SAST=1 and install semgrep on the local runner.'],
    commercialUseCases: ['Local code review', 'CI SARIF follow-up', 'secure-code evidence triage'],
  },
  {
    id: 'bundle.android-analysis',
    name: 'Android Analysis Bundle',
    version: '0.1.0',
    source: 'mobile_lab',
    status: 'planned',
    profileIds: ['mobile.android'],
    engines: ['apktool', 'frida'],
    templateIds: ['mobile.apk.manifest', 'mobile.frida.probe'],
    riskLevels: ['R1', 'R3'],
    safetyNotes: [
      'Static APK review is artifact-first.',
      'Dynamic Frida checks require a lab device or emulator and R3 approval.',
      'No persistence or live user-device targeting.',
    ],
    installationNotes: ['Set PLATFORM_ENABLE_ANDROID_TOOLBOX=1 and provide Android tooling on the local runner.'],
    commercialUseCases: ['Android APK review', 'mobile lab validation', 'domain Skill backing for mobile modules'],
  },
];

export function listToolboxProfiles(): ToolboxProfile[] {
  return TOOLBOX_PROFILES;
}

export function listScannerTemplates(): ToolTemplateProfile[] {
  return SCANNER_TEMPLATES;
}

export function listScannerTemplatePolicies(): ScannerTemplatePolicy[] {
  return SCANNER_TEMPLATES.map(scannerTemplatePolicyFromTemplate);
}

export function listToolboxBundles(): ToolboxBundle[] {
  return TOOLBOX_BUNDLES;
}

export function findScannerTemplate(templateId: string): ToolTemplateProfile | undefined {
  return SCANNER_TEMPLATES.find((template) => template.id === templateId);
}

export function scannerTemplatePolicy(templateId: string): ScannerTemplatePolicy | undefined {
  const template = findScannerTemplate(templateId);
  return template ? scannerTemplatePolicyFromTemplate(template) : undefined;
}

export function toolCatalog(): ToolCatalogEntry[] {
  return [
    {
      name: 'http.request',
      category: 'http',
      description: 'Perform one in-scope HTTP request and store a redacted exchange as evidence.',
      defaultRiskLevel: 'R1',
      requiresApproval: false,
      producesEvidence: true,
      templates: [],
    },
    {
      name: 'browser.navigate',
      category: 'browser',
      description: 'Navigate a local browser-controller session to one in-scope URL and store the redacted HTTP exchange as evidence.',
      defaultRiskLevel: 'R1',
      requiresApproval: false,
      producesEvidence: true,
      templates: [],
    },
    {
      name: 'scanner.run_template',
      category: 'scanner',
      description: 'Run a governed scanner template through the Tool Gateway without exposing raw tools to Agent Workers.',
      defaultRiskLevel: 'R2',
      requiresApproval: false,
      producesEvidence: true,
      templates: listScannerTemplates(),
    },
    {
      name: 'shell.run_sandboxed',
      category: 'shell',
      description: 'Run an allowlisted local command in a per-invocation working directory and store redacted output.',
      defaultRiskLevel: 'R2',
      requiresApproval: false,
      producesEvidence: true,
      templates: [],
    },
    {
      name: 'credential.use_placeholder',
      category: 'credential',
      description:
        'Resolve a run-local credential reference into a safe placeholder-use record without exposing raw secret material.',
      defaultRiskLevel: 'R0',
      requiresApproval: false,
      producesEvidence: true,
      templates: [],
    },
    {
      name: 'oast.start_session',
      category: 'oast',
      description: 'Create a run-local OAST callback inbox and tokenized callback URL.',
      defaultRiskLevel: 'R1',
      requiresApproval: false,
      producesEvidence: false,
      templates: [],
    },
    {
      name: 'oast.record_callback',
      category: 'oast',
      description: 'Manually record an OAST callback into the evidence engine for lab or tunnel integrations.',
      defaultRiskLevel: 'R0',
      requiresApproval: false,
      producesEvidence: true,
      templates: [],
    },
    {
      name: 'access.compare_evidence',
      category: 'access',
      description:
        'Compare two same-run evidence items for role or authorization differences and store a redacted diff artifact.',
      defaultRiskLevel: 'R0',
      requiresApproval: false,
      producesEvidence: true,
      templates: [],
    },
    {
      name: 'finding.propose',
      category: 'finding',
      description: 'Create a candidate finding only when it references evidence in the same run.',
      defaultRiskLevel: 'R0',
      requiresApproval: false,
      producesEvidence: false,
      templates: [],
    },
  ];
}

function scannerTemplatePolicyFromTemplate(template: ToolTemplateProfile): ScannerTemplatePolicy {
  return {
    templateId: template.id,
    defaultRiskLevel: template.defaultRiskLevel,
    allowedRiskLevels: allowedRiskLevelsFor(template.defaultRiskLevel),
    requiresApproval: template.defaultRiskLevel === 'R3',
    maxTimeoutMs: scannerTemplateMaxTimeout(template),
    executionMode: template.executionMode,
    profileId: template.profileId,
    engine: template.engine,
    externalExecutionFailClosed: template.executionMode === 'external',
    inputPolicy: scannerTemplateInputPolicy(template),
    executionControls: scannerTemplateExecutionControls(template),
    evidencePolicy: [
      `Evidence kind: ${template.evidenceKind}.`,
      'Outputs are redacted before storage.',
      'Findings must reference same-run evidence ids.',
    ],
    operatorNotes: [...template.riskNotes],
  };
}

function allowedRiskLevelsFor(defaultRiskLevel: RiskLevel): RiskLevel[] {
  if (defaultRiskLevel === 'R4') {
    return [];
  }
  const order: RiskLevel[] = ['R0', 'R1', 'R2', 'R3'];
  const index = order.indexOf(defaultRiskLevel);
  return index >= 0 ? order.slice(index) : [defaultRiskLevel];
}

function scannerTemplateMaxTimeout(template: ToolTemplateProfile): number {
  if (template.id === 'web.endpoint_discovery') {
    return 15_000;
  }
  if (template.executionMode === 'builtin') {
    return 10_000;
  }
  return 30_000;
}

function scannerTemplateInputPolicy(template: ToolTemplateProfile): string[] {
  if (template.domain === 'network') {
    return ['Target host or IP must match ScopePolicy.', 'No host expansion, zone transfer, packet capture, or raw socket fuzzing.'];
  }
  if (template.domain === 'sast') {
    return ['Input must be a local workspace or SARIF/SAST artifact reference.', 'Source code is not uploaded by default.'];
  }
  if (template.domain === 'mobile') {
    return ['Input must be an APK artifact, emulator, or approved lab-device reference.', 'No live user-device targeting.'];
  }
  return ['Target URL host must match ScopePolicy.', 'No credential material, destructive payloads, or out-of-scope redirects.'];
}

function scannerTemplateExecutionControls(template: ToolTemplateProfile): string[] {
  const controls = [
    'Tool Gateway enforces scope, method, risk, approval, rate-limit, audit, redaction, and evidence gates.',
    `Timeout is capped at ${scannerTemplateMaxTimeout(template)}ms for this template.`,
  ];
  if (template.executionMode === 'external') {
    controls.push('External execution requires PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1.');
    controls.push('Template id must be present in PLATFORM_ALLOWED_SCANNER_TEMPLATES unless the allowlist is "*".');
    controls.push(`Runtime profile ${template.profileId} must be available before execution.`);
  } else {
    controls.push('Runs inside the local platform process with bounded built-in logic.');
  }
  if (template.defaultRiskLevel === 'R3') {
    controls.push('R3 execution requires an approval bound to the same run, tool, target, and risk level.');
  }
  return controls;
}

export function capabilityMatrix(): CapabilityMatrixEntry[] {
  const catalog = toolCatalog();
  const templates = listScannerTemplates();
  return [
    {
      area: 'web',
      name: 'Web application assessment',
      status: capabilityStatus(['http.request', 'browser.navigate', 'scanner.run_template'], 'web'),
      highLevelTools: ['http.request', 'browser.navigate', 'scanner.run_template', 'finding.propose'],
      ...scannerCapability('web', templates),
      safetyControls: ['scope policy', 'rate limit', 'redacted HTTP evidence', 'Tool Gateway audit'],
      gaps: ['real browser DOM automation', 'TLS MITM proxy', 'large curated template pack'],
    },
    {
      area: 'network',
      name: 'Network and protocol reconnaissance',
      status: capabilityStatus(['scanner.run_template'], 'network'),
      highLevelTools: ['scanner.run_template'],
      ...scannerCapability('network', templates),
      safetyControls: ['scope policy', 'R2 scan gate', 'no raw packet access in kernel', 'bounded DNS/TLS metadata'],
      gaps: ['containerized nmap/naabu/httpx execution', 'pcap evidence vault'],
    },
    {
      area: 'auth',
      name: 'Authenticated role and access review',
      status: 'available',
      highLevelTools: ['credential.use_placeholder', 'access.compare_evidence', 'finding.propose'],
      scannerTemplates: [],
      profiles: [],
      engines: [],
      evidenceKinds: ['command_output', 'http_exchange'],
      riskLevels: ['R0', 'R1'],
      safetyControls: ['vault references only', 'raw secret rejection', 'same-run evidence diff', 'human impact validation'],
      gaps: ['vault-backed request injection', 'multi-account browser profile isolation'],
    },
    {
      area: 'oast',
      name: 'Out-of-band validation',
      status: 'partial',
      highLevelTools: ['oast.start_session', 'oast.record_callback', 'finding.propose'],
      scannerTemplates: [],
      profiles: [],
      engines: [],
      evidenceKinds: ['oast_callback', 'http_exchange'],
      riskLevels: ['R0', 'R3'],
      safetyControls: ['tokenized callback URLs', 'redacted callback evidence', 'R3 live payload gate'],
      gaps: ['public DNS/HTTP relay', 'tenant-isolated callback domains'],
    },
    {
      area: 'sast',
      name: 'Source and dependency security review',
      status: 'partial',
      highLevelTools: ['sarif.import', 'scanner.run_template', 'finding.propose'],
      ...scannerCapability('sast', templates),
      safetyControls: ['local source only', 'SARIF evidence hash', 'no source upload by default', 'finding evidence requirement'],
      gaps: ['Semgrep execution profile', 'SARIF export', 'dependency scanner adapters'],
    },
    {
      area: 'mobile',
      name: 'Android and mobile assessment',
      status: 'partial',
      highLevelTools: ['android.manifest.import', 'scanner.run_template', 'finding.propose'],
      ...scannerCapability('mobile', templates),
      safetyControls: ['manifest input hashing', 'artifact-first static review', 'R3 dynamic instrumentation gate', 'no device persistence'],
      gaps: ['full APK artifact vault', 'apktool/jadx execution', 'Frida lab device runner'],
    },
    {
      area: 'cloud',
      name: 'Cloud IAM artifact review',
      status: 'partial',
      highLevelTools: ['cloud.iam.import', 'credential.use_placeholder', 'finding.propose'],
      scannerTemplates: [],
      profiles: [],
      engines: ['cloud-iam-import'],
      evidenceKinds: ['command_output'],
      riskLevels: ['R0', 'R1'],
      safetyControls: ['IAM policy input hashing', 'no raw cloud credentials', 'read-only artifact review', 'candidate finding validation'],
      gaps: ['live cloud inventory adapter', 'multi-account IAM diff', 'CSPM integrations'],
    },
    {
      area: 'identity',
      name: 'Identity graph and AD path review',
      status: 'partial',
      highLevelTools: ['identity.graph.import', 'finding.propose'],
      scannerTemplates: [],
      profiles: [],
      engines: ['identity-graph-import'],
      evidenceKinds: ['command_output'],
      riskLevels: ['R0', 'R1'],
      safetyControls: ['graph input hashing', 'read-only identity review', 'no credential attacks', 'candidate finding validation'],
      gaps: ['live AD collector adapter', 'path scoring beyond direct edges', 'control-validation integrations'],
    },
    {
      area: 'platform',
      name: 'Agent framework, evidence, reporting, and governance',
      status: 'available',
      highLevelTools: [...catalog.map((tool) => tool.name), 'sarif.import'],
      scannerTemplates: [],
      profiles: listToolboxProfiles().map((profile) => profile.id),
      engines: ['dispatcher', 'agent-worker.v1', 'tool-gateway', 'evidence-engine', 'report-service'],
      evidenceKinds: ['http_exchange', 'command_output', 'oast_callback', 'file_hash', 'replay_bundle'],
      riskLevels: ['R0', 'R1', 'R2', 'R3', 'R4'],
      safetyControls: ['Dispatcher-owned writes', 'scope and approval gates', 'evidence-backed findings', 'audit timeline'],
      gaps: ['cloud tenant/RBAC/billing', 'desktop MITM shell', 'private deployment bundle'],
    },
  ];
}

function scannerCapability(domain: ScannerTemplateDomain, templates: ToolTemplateProfile[]): Pick<
  CapabilityMatrixEntry,
  'scannerTemplates' | 'profiles' | 'engines' | 'evidenceKinds' | 'riskLevels'
> {
  const scoped = templates.filter((template) => template.domain === domain);
  return {
    scannerTemplates: scoped.map((template) => template.id),
    profiles: [...new Set(scoped.map((template) => template.profileId))],
    engines: [...new Set(scoped.map((template) => template.engine))],
    evidenceKinds: [...new Set(scoped.map((template) => template.evidenceKind))],
    riskLevels: [...new Set(scoped.map((template) => template.defaultRiskLevel))],
  };
}

function capabilityStatus(requiredTools: string[], domain: ScannerTemplateDomain): CapabilityStatus {
  const availableTemplates = listScannerTemplates().filter(
    (template) => template.domain === domain && template.adapterStatus === 'available',
  );
  const plannedTemplates = listScannerTemplates().filter(
    (template) => template.domain === domain && template.adapterStatus !== 'available',
  );
  if (availableTemplates.length > 0 && plannedTemplates.length > 0) {
    return 'partial';
  }
  if (availableTemplates.length > 0 || requiredTools.length > 0) {
    return availableTemplates.length > 0 ? 'available' : 'planned';
  }
  return 'planned';
}
