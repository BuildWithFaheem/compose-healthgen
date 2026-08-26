import assert from 'node:assert/strict';
import { matchRecipe, RECIPES } from './recipes.js';
import { patch } from './patch.js';
import { parse } from './parse.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

// matchRecipe tests
test("matchRecipe('postgres:15') returns pg_isready recipe", () => {
  const r = matchRecipe('postgres:15');
  assert.ok(r, 'should return a recipe');
  assert.ok(r.test.join(' ').includes('pg_isready'), 'test should use pg_isready');
});

test("matchRecipe('ghcr.io/myco/redis:alpine') matches via path-suffix to redis recipe", () => {
  const r = matchRecipe('ghcr.io/myco/redis:alpine');
  assert.ok(r, 'should return a recipe');
  assert.ok(r.test.includes('redis-cli'), 'test should use redis-cli');
});

test("matchRecipe('unknown-image:latest') returns null", () => {
  const r = matchRecipe('unknown-image:latest');
  assert.strictEqual(r, null);
});

// patch tests
const COMPOSE_NO_HEALTHCHECK = `
services:
  db:
    image: postgres:15
  cache:
    image: redis:7
`.trim();

const COMPOSE_WITH_HEALTHCHECK = `
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

test('patch() adds healthcheck to service with no existing healthcheck', () => {
  const result = patch(COMPOSE_NO_HEALTHCHECK);
  assert.ok(result.includes('pg_isready'), 'postgres healthcheck should be added');
  assert.ok(result.includes('redis-cli'), 'redis healthcheck should be added');
});

test('patch() skips service with existing healthcheck when --skip-existing is set', () => {
  const result = patch(COMPOSE_WITH_HEALTHCHECK, { skipExisting: true });
  assert.ok(result.includes('my-custom-check'), 'existing healthcheck should be preserved');
  assert.ok(!result.includes('pg_isready'), 'pg_isready should not replace existing healthcheck');
});

test('patch() overwrites existing healthcheck when --skip-existing is not set', () => {
  const result = patch(COMPOSE_WITH_HEALTHCHECK);
  assert.ok(result.includes('pg_isready'), 'pg_isready should replace existing healthcheck');
});

// parse tests
test("parse() throws with clear message when 'services' key is absent", () => {
  assert.throws(
    () => parse('version: "3"'),
    (err: Error) => err.message.includes("'services'"),
  );
});

// recipes completeness test
test('every recipe entry has test, interval, timeout, retries, start_period', () => {
  const required = ['test', 'interval', 'timeout', 'retries', 'start_period'] as const;
  for (const [name, recipe] of Object.entries(RECIPES)) {
    for (const field of required) {
      assert.ok(field in recipe, `recipe '${name}' missing field '${field}'`);
    }
  }
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
