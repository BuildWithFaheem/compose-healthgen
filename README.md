# compose-healthgen

`compose-healthgen` reads a `docker-compose.yml` and adds correct `healthcheck` stanzas to every service it recognizes—postgres, redis, mysql, nginx, node, and more. It is aimed at developers who know they should add healthchecks but find the Docker syntax fiddly and can't remember the right probe command for each image.

## Install

```bash
npm install -g compose-healthgen
```

Or run without installing:

```bash
npx compose-healthgen docker-compose.yml
```

## Quick start

Given this compose file:

```yaml
services:
  db:
    image: postgres:16
  cache:
    image: redis:7
  api:
    image: node:20
```

Run:

```bash
compose-healthgen docker-compose.yml
```

Output:

```yaml
services:
  db:
    image: postgres:16
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U ${POSTGRES_USER:-postgres}
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
  cache:
    image: redis:7
    healthcheck:
      test:
        - CMD
        - redis-cli
        - ping
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
  api:
    image: node:20
    healthcheck:
      test:
        - CMD-SHELL
        - curl -f http://localhost:3000/health || exit 1
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

## Why this exists

Docker Compose has no built-in way to generate healthchecks. Developers copy them from Stack Overflow, get `interval` and `timeout` semantics backwards, or ship files with no healthchecks at all. The result is dependent services that start before their dependencies are ready—flaky startup failures in CI and local development that are annoying to diagnose because the real problem is hidden inside a container that is technically "running" but not yet accepting connections.

Writing a correct `pg_isready` invocation or knowing that MariaDB ships its own `healthcheck.sh` script is trivia that doesn't belong in your head. `compose-healthgen` keeps a curated table of working probes with sensible defaults for `interval`, `timeout`, `retries`, and `start_period`, and applies them in one command.

## Usage

**Patch and print the full compose file** (default):

```bash
compose-healthgen docker-compose.yml
```

**Preview changes as a unified diff before writing anything:**

```bash
compose-healthgen --diff docker-compose.yml
```

**Write the patched file to disk:**

```bash
compose-healthgen --out docker-compose.patched.yml docker-compose.yml

# Overwrite in place:
compose-healthgen --out docker-compose.yml docker-compose.yml
```

**Skip services that already declare a healthcheck** (preserves hand-written probes):

```bash
compose-healthgen --skip-existing docker-compose.yml
```

**Override the default port for node/express/fastify probes:**

```bash
compose-healthgen --node-port 8080 docker-compose.yml
```

### Recognized images

| Image stem | Probe |
|---|---|
| `postgres` | `pg_isready` |
| `redis` | `redis-cli ping` |
| `mysql` | `mysqladmin ping` |
| `mariadb` | `healthcheck.sh --connect --innodb_initialized` |
| `mongo` / `mongodb` | `mongosh db.adminCommand('ping')` |
| `rabbitmq` | `rabbitmq-diagnostics check_port_connectivity` |
| `memcached` | `echo stats \| nc` |
| `elasticsearch` | `curl /_cluster/health` |
| `nginx` | `curl http://localhost/` |
| `node` / `express` / `fastify` | `curl http://localhost:3000/health` |

Image matching is flexible: `myregistry.io/library/postgres:16-alpine` matches `postgres` the same as `postgres:16`.

## How it works

`compose-healthgen` parses the compose file with `js-yaml`, walks every service entry, and looks up the service's `image` field against a built-in recipe table. Matching runs in three passes—exact key, path-suffix (so `library/redis` matches `redis`), then substring—stopping at the first hit. When a match is found the recipe's `healthcheck` block is merged into the service object. The patched document is serialized back to YAML and either written to stdout, written to a file with `--out`, or diffed against the original with `--diff` (using the `diff` package's unified-format output). No network calls, no Docker daemon required.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © [Syed Muhammad Faheem](https://github.com/SyedMuhammadFaheem)
