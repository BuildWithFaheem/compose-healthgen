#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';
import { patch } from './patch.js';

const program = new Command();

program
  .name('compose-healthgen')
  .description('Add healthchecks to docker-compose.yml services')
  .argument('<file>', 'Path to docker-compose.yml')
  .option('--diff', 'Print unified diff instead of full file')
  .option('--out <outfile>', 'Write patched file to disk instead of stdout')
  .option('--skip-existing', 'Leave services that already have a healthcheck untouched')
  .option('--node-port <port>', 'Override default port (3000) used in node/express/fastify probes', '3000')
  .action((file: string, opts: { diff: boolean; out?: string; skipExisting: boolean; nodePort: string }) => {
    const content = readFileSync(file, 'utf8');
    const result = patch(content, {
      diff: opts.diff,
      skipExisting: opts.skipExisting,
      nodePort: parseInt(opts.nodePort, 10),
      filename: file,
    });

    if (opts.out) {
      writeFileSync(opts.out, result, 'utf8');
    } else {
      process.stdout.write(result);
    }
  });

program.parse();
