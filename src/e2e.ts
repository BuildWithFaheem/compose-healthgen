import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '..');
const CLI = resolve(dir, 'dist/cli.js');
const FX = resolve(dir, 'fixtures');

function cli(...args: string[]) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8', cwd: dir });
}

let failures = 0;

function ok(name: string, pass: boolean, detail = '') {
  if (pass) {
    console.log(`  ok  ${name}`);
  } else {
    console.error(`FAIL  ${name}${detail ? '\n      ' + detail.trim().slice(0, 300) : ''}`);
    failures++;
  }
}

// 1. postgres-only stdout contains pg_isready
{
  const r = cli(`${FX}/postgres-only.yml`);
  ok('postgres-only: stdout contains pg_isready', r.stdout.includes('pg_isready'), r.stderr);
}

// 2. --diff multi-service: valid unified diff (has --- and +++ header lines)
{
  const r = cli('--diff', `${FX}/multi-service.yml`);
  const lines = r.stdout.split('\n');
  const hasDiff = lines.some(l => l.startsWith('---')) && lines.some(l => l.startsWith('+++'));
  ok('--diff multi-service: valid unified diff format', hasDiff, r.stderr || r.stdout.slice(0, 200));
}

// 3. all-known-services piped to docker compose -f - config exits 0
{
  const composed = cli(`${FX}/all-known-services.yml`);
  if (composed.status !== 0) {
    ok('all-known-services: CLI exits 0', false, composed.stderr);
  } else {
    const dc = spawnSync('docker', ['compose', '-f', '-', 'config'], {
      input: composed.stdout,
      encoding: 'utf8',
    });
    ok('all-known-services | docker compose -f - config exits 0', dc.status === 0, dc.stderr);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll E2E tests passed');
