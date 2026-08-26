# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CLI with `--diff`, `--out`, `--skip-existing`, and `--node-port` flags
- Built-in healthcheck recipes for postgres, redis, mysql, mariadb, mongodb, rabbitmq, memcached, elasticsearch, nginx, node, express, and fastify
- Three-pass image matching (exact → path-suffix → substring) so private-registry and multi-segment image names resolve correctly
- `--node-port` flag to override the default port (3000) used in curl probes for node/express/fastify services
- `--skip-existing` flag to preserve hand-written healthchecks
- Public API (`patch`, `matchRecipe`, `RECIPES`) exported from `index.ts` for programmatic use
