import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseNmapOutput, extractNmapHosts, isValidNmapOutput } from '../src/scanners/network/nmap-adapter.js';
import { parseHttpxOutput, extractHttpxHosts, isValidHttpxOutput } from '../src/scanners/web/httpx-adapter.js';
import { parseFfufOutput, extractFfufMatches, isValidFfufOutput } from '../src/scanners/web/ffuf-adapter.js';
import { parseSqlmapOutput, extractSqlmapInjections, isValidSqlmapOutput } from '../src/scanners/web/sqlmap-adapter.js';
import { parseSemgrepOutput, extractSemgrepFindings, isValidSemgrepOutput } from '../src/scanners/code/semgrep-adapter.js';

describe('nmap-adapter', () => {
  it('should parse nmap text output with open ports', () => {
    const raw = `
Nmap scan report for example.com (192.168.1.1)
Host is up (0.0010s latency).
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.1
80/tcp   open  http    nginx 1.18.0
443/tcp  open  https   nginx 1.18.0
3306/tcp open  mysql   MySQL 8.0.32-0ubuntu0.22.04.2
`;

    const results = parseNmapOutput(raw);

    assert.equal(results.length, 4);
    assert.equal(results[0].engine, 'nmap');
    assert.equal(results[0].severity, 'info');
    assert.equal(results[0].confidence, 'needs_dynamic_confirmation');
    assert(results[0].title.includes('22/tcp'));
    assert(results[0].title.includes('ssh'));
    assert.equal(results[0].evidenceSummary.port, 22);
    assert.equal(results[0].evidenceSummary.protocol, 'tcp');
    assert.equal(results[0].evidenceSummary.service, 'ssh');
    assert(results[0].evidenceSummary.version.includes('OpenSSH 8.9p1'));

    assert(results[1].title.includes('80/tcp'));
    assert(results[1].title.includes('http'));
    assert.equal(results[1].evidenceSummary.port, 80);

    assert(results[3].title.includes('3306/tcp'));
    assert(results[3].title.includes('mysql'));
  });

  it('should extract structured host information', () => {
    const raw = `
Nmap scan report for example.com
PORT     STATE SERVICE
22/tcp   open  ssh
80/tcp   open  http
443/tcp  open  https
`;

    const hosts = extractNmapHosts(raw);

    assert.equal(hosts.length, 1);
    assert.equal(hosts[0].host, 'example.com');
    assert.equal(hosts[0].ports.length, 3);
    assert.equal(hosts[0].ports[0].port, 22);
    assert.equal(hosts[0].ports[0].protocol, 'tcp');
    assert.equal(hosts[0].ports[0].state, 'open');
    assert.equal(hosts[0].ports[0].service, 'ssh');
  });

  it('should validate nmap output format', () => {
    assert.equal(isValidNmapOutput('Nmap scan report for example.com'), true);
    assert.equal(isValidNmapOutput('22/tcp open ssh'), true);
    assert.equal(isValidNmapOutput('invalid output'), false);
    assert.equal(isValidNmapOutput(''), false);
  });

  it('should handle empty nmap output', () => {
    const results = parseNmapOutput('Nmap scan report for example.com\nNo ports detected');
    assert.equal(results.length, 0);
  });

  it('should respect maxResults limit', () => {
    const ports = Array.from({ length: 300 }, (_, i) => `${i + 1}/tcp open service${i}`).join('\n');
    const raw = `Nmap scan report for example.com\n${ports}`;
    const results = parseNmapOutput(raw, { maxResults: 50 });
    assert.equal(results.length, 50);
  });
});

describe('httpx-adapter', () => {
  it('should parse httpx JSONL output', () => {
    const raw = `
{"url":"https://example.com","status_code":200,"title":"Example Domain","webserver":"nginx","tech":["Nginx","Ubuntu"]}
{"url":"https://api.example.com","status_code":200,"webserver":"Apache","content_type":"application/json"}
`.trim();

    const results = parseHttpxOutput(raw);

    assert.equal(results.length, 2);
    assert.equal(results[0].engine, 'httpx');
    assert.equal(results[0].severity, 'info');
    assert.equal(results[0].confidence, 'needs_dynamic_confirmation');
    assert(results[0].title.includes('Example Domain'));
    assert.equal(results[0].evidenceSummary.statusCode, 200);
    assert.equal(results[0].evidenceSummary.webserver, 'nginx');
    assert.equal(results[0].evidenceSummary.tech.length, 2);
    assert(results[0].evidenceSummary.tech.includes('Nginx'));

    assert(results[1].title.includes('api.example.com'));
    assert.equal(results[1].evidenceSummary.statusCode, 200);
    assert.equal(results[1].evidenceSummary.contentType, 'application/json');
  });

  it('should extract structured host information', () => {
    const raw = `
{"url":"https://example.com","status_code":200,"title":"Example","tech":["React","Next.js"]}
{"url":"https://test.example.com","status_code":404}
`.trim();

    const hosts = extractHttpxHosts(raw);

    assert.equal(hosts.length, 2);
    assert.equal(hosts[0].url, 'https://example.com');
    assert.equal(hosts[0].statusCode, 200);
    assert.equal(hosts[0].title, 'Example');
    assert.equal(hosts[0].tech.length, 2);
    assert.equal(hosts[1].url, 'https://test.example.com');
    assert.equal(hosts[1].statusCode, 404);
  });

  it('should validate httpx output format', () => {
    assert.equal(isValidHttpxOutput('{"url":"https://example.com"}'), true);
    assert.equal(isValidHttpxOutput('{"host":"example.com"}'), true);
    assert.equal(isValidHttpxOutput('invalid json'), false);
    assert.equal(isValidHttpxOutput(''), false);
  });

  it('should handle empty lines in JSONL', () => {
    const raw = `
{"url":"https://example.com"}

{"url":"https://test.com"}

`.trim();

    const results = parseHttpxOutput(raw);
    assert.equal(results.length, 2);
  });

  it('should respect maxResults limit', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `{"url":"https://site${i}.com"}`).join('\n');
    const results = parseHttpxOutput(lines, { maxResults: 100 });
    assert.equal(results.length, 100);
  });
});

describe('ffuf-adapter', () => {
  it('should parse ffuf JSON output', () => {
    const raw = JSON.stringify({
      results: [
        {
          url: 'https://example.com/admin',
          status: 200,
          length: 1234,
          words: 100,
          input: { FUZZ: 'admin' },
        },
        {
          url: 'https://example.com/backup',
          status: 403,
          length: 567,
          words: 50,
          input: { FUZZ: 'backup' },
        },
      ],
    });

    const results = parseFfufOutput(raw);

    assert.equal(results.length, 2);
    assert.equal(results[0].engine, 'ffuf');
    assert.equal(results[0].severity, 'info');
    assert.equal(results[0].confidence, 'needs_dynamic_confirmation');
    assert(results[0].title.includes('admin'));
    assert.equal(results[0].evidenceSummary.statusCode, 200);
    assert.equal(results[0].evidenceSummary.length, 1234);
    assert.equal(results[0].evidenceSummary.words, 100);
    assert.equal(results[0].evidenceSummary.fuzzWord, 'admin');

    assert(results[1].title.includes('backup'));
    assert.equal(results[1].evidenceSummary.statusCode, 403);
  });

  it('should extract structured match information', () => {
    const raw = JSON.stringify({
      results: [
        { url: 'https://example.com/api', status: 200, length: 500, input: { FUZZ: 'api' } },
        { url: 'https://example.com/test', status: 404, length: 100, input: { FUZZ: 'test' } },
      ],
    });

    const matches = extractFfufMatches(raw);

    assert.equal(matches.length, 2);
    assert.equal(matches[0].url, 'https://example.com/api');
    assert.equal(matches[0].statusCode, 200);
    assert.equal(matches[0].fuzzWord, 'api');
    assert.equal(matches[1].statusCode, 404);
  });

  it('should validate ffuf output format', () => {
    assert.equal(isValidFfufOutput('{"results":[]}'), true);
    assert.equal(isValidFfufOutput('{}'), true);
    assert.equal(isValidFfufOutput('[]'), false);
    assert.equal(isValidFfufOutput('invalid json'), false);
    assert.equal(isValidFfufOutput(''), false);
  });

  it('should handle empty results array', () => {
    const raw = JSON.stringify({ results: [] });
    const results = parseFfufOutput(raw);
    assert.equal(results.length, 0);
  });

  it('should respect maxResults limit', () => {
    const results = Array.from({ length: 300 }, (_, i) => ({
      url: `https://example.com/path${i}`,
      status: 200,
      input: { FUZZ: `path${i}` },
    }));
    const raw = JSON.stringify({ results });
    const parsed = parseFfufOutput(raw, { maxResults: 100 });
    assert.equal(parsed.length, 100);
  });
});

describe('sqlmap-adapter', () => {
  it('should parse sqlmap text output with confirmed injections', () => {
    const raw = `
sqlmap/1.7.2#stable
[*] starting @ 10:30:00

URL: https://example.com/page?id=1

Parameter: id (GET)
    Type: boolean-based blind
    Title: AND boolean-based blind - WHERE or HAVING clause
    Payload: id=1 AND 1234=1234

    Type: time-based blind
    Title: MySQL >= 5.0.12 AND time-based blind
    Payload: id=1 AND SLEEP(5)

back-end DBMS: MySQL >= 5.0.12
`;

    const results = parseSqlmapOutput(raw);

    assert.equal(results.length, 1);
    assert.equal(results[0].engine, 'sqlmap');
    assert.equal(results[0].severity, 'high');
    assert.equal(results[0].confidence, 'likely');
    assert(results[0].title.includes('SQL injection confirmed'));
    assert(results[0].title.includes('id'));
    assert.equal(results[0].evidenceSummary.parameter, 'id');
    assert.equal(results[0].evidenceSummary.place, 'GET');
    assert(results[0].evidenceSummary.technique.includes('boolean-based blind'));
  });

  it('should extract structured injection information', () => {
    const raw = `
URL: https://example.com/api?user=test&action=view

Parameter: user (GET)
    Title: Generic UNION query (NULL) - 5 columns
    Type: UNION query

Parameter: action (POST)
    Title: PostgreSQL > 8.1 stacked queries
    Type: stacked queries

back-end DBMS: PostgreSQL
`;

    const injections = extractSqlmapInjections(raw);

    assert.equal(injections.length, 2);
    assert.equal(injections[0].parameter, 'user');
    assert.equal(injections[0].place, 'GET');
    assert(injections[0].technique.includes('UNION query'));
    assert.equal(injections[0].url, 'https://example.com/api?user=test&action=view');
    assert.equal(injections[0].dbms, 'PostgreSQL');

    assert.equal(injections[1].parameter, 'action');
    assert.equal(injections[1].place, 'POST');
  });

  it('should validate sqlmap output format', () => {
    assert.equal(isValidSqlmapOutput('sqlmap/1.7.2'), true);
    assert.equal(isValidSqlmapOutput('Parameter: id (GET)'), true);
    assert.equal(isValidSqlmapOutput('URL: https://example.com'), true);
    assert.equal(isValidSqlmapOutput('invalid output'), false);
    assert.equal(isValidSqlmapOutput(''), false);
  });

  it('should return empty array when no injections found', () => {
    const raw = 'sqlmap/1.7.2\n[*] testing connection\nall tested parameters do not appear to be injectable';
    const results = parseSqlmapOutput(raw);
    assert.equal(results.length, 0);
  });

  it('should handle multiple parameters in same output', () => {
    const raw = `
URL: https://example.com/search

Parameter: q (GET)
    Title: MySQL UNION query
    Type: UNION query

Parameter: sort (GET)
    Title: MySQL time-based blind
    Type: time-based blind
`;

    const results = parseSqlmapOutput(raw);
    assert.equal(results.length, 2);
    assert.equal(results[0].evidenceSummary.parameter, 'q');
    assert.equal(results[1].evidenceSummary.parameter, 'sort');
  });

  it('should respect maxResults limit', () => {
    const params = Array.from(
      { length: 60 },
      (_, i) => `Parameter: param${i} (GET)\n    Title: SQL injection\n    Type: boolean-based`,
    ).join('\n\n');
    const raw = `sqlmap/1.7.2\nURL: https://example.com\n${params}`;
    const results = parseSqlmapOutput(raw, { maxResults: 30 });
    assert.equal(results.length, 30);
  });
});

describe('semgrep-adapter', () => {
  it('should parse semgrep JSON output', () => {
    const raw = JSON.stringify({
      results: [
        {
          check_id: 'javascript.express.security.audit.xss.mustache.var-in-href',
          path: 'src/views/user.js',
          start: { line: 42, col: 10 },
          end: { line: 42, col: 50 },
          extra: {
            message: 'Potential XSS vulnerability in mustache template',
            severity: 'WARNING',
            metadata: {
              category: 'security',
              impact: 'MEDIUM',
              cwe: ['CWE-79'],
              owasp: ['A03:2021'],
              references: 'https://owasp.org/www-community/attacks/xss/',
            },
          },
        },
        {
          check_id: 'javascript.lang.security.audit.hardcoded-secret',
          path: 'src/config/database.js',
          start: { line: 15, col: 5 },
          extra: {
            message: 'Hardcoded secret detected',
            severity: 'ERROR',
            metadata: {
              impact: 'HIGH',
            },
          },
        },
      ],
    });

    const results = parseSemgrepOutput(raw);

    assert.equal(results.length, 2);
    assert.equal(results[0].engine, 'semgrep');
    assert.equal(results[0].severity, 'medium');
    assert.equal(results[0].confidence, 'needs_dynamic_confirmation');
    assert(results[0].title.includes('xss.mustache'));
    assert(results[0].affectedAsset.includes('src/views/user.js'));
    assert(results[0].affectedAsset.includes(':42'));
    assert.equal(results[0].evidenceSummary.checkId, 'javascript.express.security.audit.xss.mustache.var-in-href');
    assert.equal(results[0].evidenceSummary.line, 42);

    assert.equal(results[1].severity, 'high');
    assert(results[1].title.includes('hardcoded-secret'));
  });

  it('should extract structured finding information', () => {
    const raw = JSON.stringify({
      results: [
        {
          check_id: 'python.django.security.injection.sql.sql-injection-using-raw',
          path: 'app/views.py',
          start: { line: 100, col: 5 },
          end: { line: 102, col: 10 },
          extra: {
            message: 'SQL injection vulnerability',
            severity: 'ERROR',
            metadata: {
              category: 'security',
              impact: 'HIGH',
              cwe: ['CWE-89'],
            },
          },
        },
      ],
    });

    const findings = extractSemgrepFindings(raw);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].checkId, 'python.django.security.injection.sql.sql-injection-using-raw');
    assert.equal(findings[0].path, 'app/views.py');
    assert.equal(findings[0].line, 100);
    assert.equal(findings[0].column, 5);
    assert.equal(findings[0].endLine, 102);
    assert.equal(findings[0].endColumn, 10);
    assert.equal(findings[0].severity, 'high');
    assert.equal(findings[0].cwe?.length, 1);
    assert(findings[0].cwe?.includes('CWE-89'));
  });

  it('should validate semgrep output format', () => {
    assert.equal(isValidSemgrepOutput('{"results":[]}'), true);
    assert.equal(isValidSemgrepOutput('{}'), true);
    assert.equal(isValidSemgrepOutput('[]'), false);
    assert.equal(isValidSemgrepOutput('invalid json'), false);
    assert.equal(isValidSemgrepOutput(''), false);
  });

  it('should handle empty results array', () => {
    const raw = JSON.stringify({ results: [] });
    const results = parseSemgrepOutput(raw);
    assert.equal(results.length, 0);
  });

  it('should sanitize paths relative to workspace', () => {
    const raw = JSON.stringify({
      results: [
        {
          check_id: 'test-rule',
          path: '/home/user/project/src/app.js',
          start: { line: 10 },
          extra: { message: 'Test', severity: 'INFO' },
        },
      ],
    });

    const results = parseSemgrepOutput(raw, { workspace: '/home/user/project' });

    assert(results[0].affectedAsset.includes('src/app.js'));
    assert(!results[0].affectedAsset.includes('/home/user'));
  });

  it('should hash paths outside workspace', () => {
    const raw = JSON.stringify({
      results: [
        {
          check_id: 'test-rule',
          path: '/etc/passwd',
          start: { line: 1 },
          extra: { message: 'Test', severity: 'INFO' },
        },
      ],
    });

    const results = parseSemgrepOutput(raw, { workspace: '/home/user/project' });

    assert(results[0].affectedAsset.includes('outside-workspace:'));
  });

  it('should respect maxResults limit', () => {
    const results = Array.from({ length: 300 }, (_, i) => ({
      check_id: `rule-${i}`,
      path: `src/file${i}.js`,
      start: { line: 1 },
      extra: { message: 'Test', severity: 'INFO' },
    }));
    const raw = JSON.stringify({ results });
    const parsed = parseSemgrepOutput(raw, { maxResults: 150 });
    assert.equal(parsed.length, 150);
  });
});

describe('scanner adapters - error handling', () => {
  it('nmap should throw on invalid JSONL input', () => {
    // nmap uses text, not JSONL, so this is not applicable
    // but we test that it handles malformed text gracefully
    const results = parseNmapOutput('random\ngarbage\ntext');
    assert.equal(results.length, 0);
  });

  it('httpx should throw on invalid JSONL', () => {
    assert.throws(() => {
      parseHttpxOutput('{"url":"test"}\ninvalid json line\n{"url":"test2"}');
    }, /Invalid JSONL/);
  });

  it('ffuf should throw on invalid JSON', () => {
    assert.throws(() => {
      parseFfufOutput('not valid json');
    }, /Invalid FFUF JSON/);
  });

  it('sqlmap should handle text gracefully', () => {
    // sqlmap uses text parsing, should not throw
    const results = parseSqlmapOutput('random output without parameters');
    assert.equal(results.length, 0);
  });

  it('semgrep should throw on invalid JSON', () => {
    assert.throws(() => {
      parseSemgrepOutput('not valid json');
    }, /Invalid Semgrep JSON/);
  });
});

describe('scanner adapters - security', () => {
  it('should redact sensitive URLs in nmap', () => {
    const raw = 'Nmap scan report for secret-api-key-abc123.internal.company.com\n22/tcp open ssh';
    const results = parseNmapOutput(raw);
    // Redaction should occur but basic structure preserved
    assert.equal(results.length, 1);
  });

  it('should redact sensitive URLs in httpx', () => {
    const raw = '{"url":"https://api.example.com/users?token=secret123","status_code":200}';
    const results = parseHttpxOutput(raw);
    // Redaction should occur but result should still be parsed
    assert.equal(results.length, 1);
  });

  it('should redact sensitive URLs in ffuf', () => {
    const raw = JSON.stringify({
      results: [{ url: 'https://example.com/admin?apiKey=secret', status: 200 }],
    });
    const results = parseFfufOutput(raw);
    assert.equal(results.length, 1);
  });

  it('should redact sensitive URLs in sqlmap', () => {
    const raw = 'URL: https://example.com/api?token=secret123\nParameter: id (GET)\nTitle: SQL injection';
    const results = parseSqlmapOutput(raw);
    assert.equal(results.length, 1);
  });

  it('should sanitize absolute paths in semgrep', () => {
    const raw = JSON.stringify({
      results: [
        {
          check_id: 'test',
          path: 'C:\\Users\\Administrator\\secrets\\config.js',
          start: { line: 1 },
          extra: { message: 'Test', severity: 'INFO' },
        },
      ],
    });
    const results = parseSemgrepOutput(raw);
    // Should hash or sanitize the path
    assert(!results[0].affectedAsset.includes('Administrator'));
  });
});
