import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

const dir = resolve(import.meta.dirname, '..');
const CLI = resolve(dir, 'dist/cli.js');
const FX = resolve(dir, 'fixtures');
const DOCKER_AVAILABLE = spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;

function cli(...args: string[]) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8', cwd: dir });
}

let failures = 0;
let passes = 0;

function ok(name: string, pass: boolean, detail = '') {
  if (pass) {
    console.log(`  ok  ${name}`);
    passes++;
  } else {
    console.error(`FAIL  ${name}${detail ? '\n      ' + detail.trim().slice(0, 400) : ''}`);
    failures++;
  }
}

function withTempFile(content: string, fn: (path: string) => void) {
  const tmp = mkdtempSync(resolve(tmpdir(), 'chg-'));
  const file = resolve(tmp, 'compose.yml');
  writeFileSync(file, content, 'utf8');
  try {
    fn(file);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function dockerValidates(composeYaml: string): { ok: boolean; detail: string } {
  const dc = spawnSync('docker', ['compose', '-f', '-', 'config'], { input: composeYaml, encoding: 'utf8' });
  return { ok: dc.status === 0, detail: dc.stderr };
}

// ---------------------------------------------------------------------------
// 1. Happy-path flows across fixtures and output modes
// ---------------------------------------------------------------------------

{
  const r = cli(`${FX}/postgres-only.yml`);
  ok('postgres-only: exits 0', r.status === 0, r.stderr);
  ok('postgres-only: stdout contains pg_isready', r.stdout.includes('pg_isready'), r.stderr);
}

{
  const r = cli(`${FX}/multi-service.yml`);
  ok('multi-service: postgres + redis both patched', r.stdout.includes('pg_isready') && r.stdout.includes('redis-cli'), r.stderr);
}

{
  const r = cli(`${FX}/all-known-services.yml`);
  const expectedMarkers = [
    'pg_isready', 'redis-cli', 'curl -f http://localhost/', 'mysqladmin',
    'healthcheck.sh', 'mongosh', 'rabbitmq-diagnostics', 'nc -w1 localhost 11211',
    '_cluster/health', 'localhost:3000/health',
  ];
  const missing = expectedMarkers.filter(m => !r.stdout.includes(m));
  ok('all-known-services: every recognized image gets its recipe', missing.length === 0, `missing: ${missing.join(', ')}`);
}

{
  const r = cli('--diff', `${FX}/multi-service.yml`);
  const lines = r.stdout.split('\n');
  const hasDiff = lines.some(l => l.startsWith('---')) && lines.some(l => l.startsWith('+++'));
  ok('--diff: produces unified diff headers', hasDiff, r.stdout.slice(0, 200));
}

withTempFile(readFileSync(`${FX}/postgres-only.yml`, 'utf8'), (input) => {
  const outFile = input.replace('.yml', '.out.yml');
  const r = cli(input, '--out', outFile);
  ok('--out: CLI exits 0 and writes no stdout', r.status === 0 && r.stdout === '', r.stderr);
  const written = readFileSync(outFile, 'utf8');
  ok('--out: written file contains healthcheck', written.includes('pg_isready'), written.slice(0, 200));
});

{
  const withHc = `
services:
  db:
    image: postgres:15
    healthcheck:
      test: ["CMD", "my-custom-check"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
`.trim();
  withTempFile(withHc, (input) => {
    const skip = cli(input, '--skip-existing');
    ok('--skip-existing: preserves custom healthcheck', skip.stdout.includes('my-custom-check') && !skip.stdout.includes('pg_isready'), skip.stderr);

    const overwrite = cli(input);
    ok('no --skip-existing: overwrites existing healthcheck', overwrite.stdout.includes('pg_isready'), overwrite.stderr);
  });
}

// ---------------------------------------------------------------------------
// 2. Recipe-matching matrix
// ---------------------------------------------------------------------------

{
  const compose = `
services:
  a:
    image: redis:7
  b:
    image: ghcr.io/myco/redis:alpine
  c:
    image: mycompany.io/infra/postgres-custom:latest
  d:
    image: totally-unknown-image:latest
`.trim();
  withTempFile(compose, (input) => {
    const r = cli(input);
    ok('exact match (redis:7)', r.stdout.includes('redis-cli'), r.stderr);
    ok('path-suffix match (ghcr.io/myco/redis)', /b:\n\s+image:[^\n]*\n\s+healthcheck:\n\s+test:\n\s+- CMD\n\s+- redis-cli/.test(r.stdout), r.stdout);
    ok('substring match (mycompany.io/infra/postgres-custom)', /c:\n\s+image:[^\n]*\n\s+healthcheck:[\s\S]*?pg_isready/.test(r.stdout), r.stdout);
    ok('unknown image left untouched (no healthcheck key for service d)', !/d:\n\s+image: totally-unknown-image:latest\n\s+healthcheck:/.test(r.stdout), r.stdout);
  });
}

{
  const compose = `
services:
  api:
    image: node:20-alpine
`.trim();
  withTempFile(compose, (input) => {
    const custom = cli(input, '--node-port', '8080');
    ok('--node-port overrides default port in probe', custom.stdout.includes('localhost:8080/health'), custom.stderr);
    const def = cli(input);
    ok('default node port is 3000', def.stdout.includes('localhost:3000/health'), def.stderr);
  });
}

// ---------------------------------------------------------------------------
// 3. Error / edge-case flows (previously uncaught crashes)
// ---------------------------------------------------------------------------

{
  const r = cli('/nonexistent/path/compose.yml');
  ok('missing file: exits non-zero', r.status !== 0, `status=${r.status}`);
  ok('missing file: no raw stack trace on stderr', !r.stderr.includes('node:fs:') && !r.stderr.includes('at Object.<anonymous>'), r.stderr.slice(0, 300));
  ok('missing file: prints a clear error message', /error/i.test(r.stderr), r.stderr.slice(0, 300));
}

withTempFile('services: [this is not, valid: yaml', (input) => {
  const r = cli(input);
  ok('malformed YAML: exits non-zero', r.status !== 0, `status=${r.status}`);
  ok('malformed YAML: no raw stack trace on stderr', !r.stderr.includes('YAMLException') || !r.stderr.includes('.mjs:'), r.stderr.slice(0, 300));
});

withTempFile('version: "3"', (input) => {
  const r = cli(input);
  ok("missing 'services' key: exits non-zero", r.status !== 0, `status=${r.status}`);
  ok("missing 'services' key: message mentions 'services'", /services/i.test(r.stderr), r.stderr.slice(0, 300));
  ok("missing 'services' key: no raw stack trace", !r.stderr.includes('.js:') || r.stderr.split('\n').length < 5, r.stderr.slice(0, 300));
});

withTempFile('services:\n', (input) => {
  const r = cli(input);
  ok("null 'services' value: exits non-zero instead of crashing", r.status !== 0, `status=${r.status}`);
  ok("null 'services' value: no raw stack trace", !r.stderr.includes('TypeError'), r.stderr.slice(0, 300));
});

{
  const compose = `
services:
  api:
    image: node:20
`.trim();
  withTempFile(compose, (input) => {
    const nonNumeric = cli(input, '--node-port', 'abc');
    ok('--node-port abc: rejected, not silently emitting NaN', nonNumeric.status !== 0 && !nonNumeric.stdout.includes('NaN'), `status=${nonNumeric.status}\n${nonNumeric.stdout}`);

    const negative = cli(input, '--node-port', '-1');
    ok('--node-port -1: rejected', negative.status !== 0, `status=${negative.status}\n${negative.stdout}`);

    const zero = cli(input, '--node-port', '0');
    ok('--node-port 0: rejected', zero.status !== 0, `status=${zero.status}\n${zero.stdout}`);

    const valid = cli(input, '--node-port', '4000');
    ok('--node-port 4000: still works', valid.status === 0 && valid.stdout.includes('localhost:4000/health'), valid.stderr);
  });
}

// ---------------------------------------------------------------------------
// 4. Consistency checks
// ---------------------------------------------------------------------------

{
  const r1 = cli(`${FX}/all-known-services.yml`);
  const r2 = cli(`${FX}/all-known-services.yml`);
  ok('idempotency: same input produces same output on repeated runs', r1.stdout === r2.stdout, 'outputs differ between runs');
}

{
  const compose = `
services:
  db1:
    image: postgres:16
  db2:
    image: postgres:16
`.trim();
  withTempFile(compose, (input) => {
    const r = cli(input);
    ok('duplicate-image services: no YAML anchors/aliases emitted', !r.stdout.includes('&ref_') && !r.stdout.includes('*ref_'), r.stdout);
    const parsed = yaml.load(r.stdout) as { services: Record<string, { healthcheck: { test: unknown[] } } > };
    const t1 = parsed.services.db1.healthcheck.test;
    const t2 = parsed.services.db2.healthcheck.test;
    ok('duplicate-image services: healthcheck.test arrays are independent objects', t1 !== t2, 'same array reference reused across services');
  });
}

// ---------------------------------------------------------------------------
// 5. Docker Compose compliance check
// ---------------------------------------------------------------------------

if (DOCKER_AVAILABLE) {
  {
    const composed = cli(`${FX}/all-known-services.yml`);
    const dc = dockerValidates(composed.stdout);
    ok('all-known-services output: valid per `docker compose config`', dc.ok, dc.detail);
  }
  {
    const composed = cli(`${FX}/multi-service.yml`, '--node-port', '4000');
    const dc = dockerValidates(composed.stdout);
    ok('multi-service + --node-port output: valid per `docker compose config`', dc.ok, dc.detail);
  }
} else {
  console.log('  --  skipping docker compose compliance checks (docker not available)');
}

console.log(`\n${passes + failures} checks: ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll flow tests passed');
