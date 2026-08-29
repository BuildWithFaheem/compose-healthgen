# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-30

### Added

- CLI (`compose-healthgen <file>`) that reads a `docker-compose.yml` and adds
  production-ready `healthcheck:` stanzas for recognized service images.
- Recipes for postgres, redis, nginx, mysql, mariadb, mongo/mongodb,
  rabbitmq, memcached, elasticsearch, and node/express/fastify.
- Image matching by exact tag, path-suffix (private registries), and
  substring, in that precedence order.
- `--diff` to print a unified diff instead of the full file.
- `--out <file>` to write the patched file to disk.
- `--skip-existing` to leave services that already define a healthcheck
  untouched.
- `--node-port <port>` to override the default port used in node/express/
  fastify HTTP probes.
- `--version` flag.

### Fixed

- Clean, non-crashing error messages (with exit code 1) for a missing input
  file, malformed YAML, a missing or malformed `services` key, and an
  invalid `--out` path — previously these surfaced as raw Node stack traces.
- `--node-port` now validates its input (integer, 1-65535) instead of
  silently emitting broken probes such as `localhost:NaN`.
- Services sharing the same image no longer emit YAML anchors/aliases in
  the output; each patched service gets an independent healthcheck object.
