#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { Command, InvalidArgumentError } from 'commander';
import { createRequire } from 'node:module';
import { patch } from './patch.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('must be an integer between 1 and 65535.');
  }
  return port;
}

const program = new Command();

program
  .name('compose-healthgen')
  .description('Add healthchecks to docker-compose.yml services')
  .version(version)
  .argument('<file>', 'Path to docker-compose.yml')
  .option('--diff', 'Print unified diff instead of full file')
  .option('--out <outfile>', 'Write patched file to disk instead of stdout')
  .option('--skip-existing', 'Leave services that already have a healthcheck untouched')
  .option('--node-port <port>', 'Override default port (3000) used in node/express/fastify probes', parsePort, 3000)
  .action((file: string, opts: { diff: boolean; out?: string; skipExisting: boolean; nodePort: number }) => {
    try {
      const content = readFileSync(file, 'utf8');
      const result = patch(content, {
        diff: opts.diff,
        skipExisting: opts.skipExisting,
        nodePort: opts.nodePort,
        filename: file,
      });

      if (opts.out) {
        writeFileSync(opts.out, result, 'utf8');
      } else {
        process.stdout.write(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
