// Network scanner adapters
export {
  parseNmapOutput,
  extractNmapHosts,
  isValidNmapOutput,
  type NmapResult,
  type NmapPort,
  type NmapHost,
  type NmapAdapterOptions,
} from './network/nmap-adapter.js';

// Web scanner adapters
export {
  parseHttpxOutput,
  extractHttpxHosts,
  isValidHttpxOutput,
  type HttpxResult,
  type HttpxHost,
  type HttpxAdapterOptions,
} from './web/httpx-adapter.js';

export {
  parseFfufOutput,
  extractFfufMatches,
  isValidFfufOutput,
  type FfufResult,
  type FfufMatch,
  type FfufAdapterOptions,
} from './web/ffuf-adapter.js';

export {
  parseSqlmapOutput,
  extractSqlmapInjections,
  isValidSqlmapOutput,
  type SqlmapResult,
  type SqlmapInjection,
  type SqlmapAdapterOptions,
} from './web/sqlmap-adapter.js';

// Code scanner adapters
export {
  parseSemgrepOutput,
  extractSemgrepFindings,
  isValidSemgrepOutput,
  type SemgrepResult,
  type SemgrepFinding,
  type SemgrepAdapterOptions,
} from './code/semgrep-adapter.js';
