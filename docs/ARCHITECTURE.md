# Architecture

`compose-healthgen` is a small CLI with four modules. Each has a single responsibility and no shared mutable state.

```
src/
  cli.ts      — argument parsing and I/O (commander)
  parse.ts    — YAML → ComposeFile object (js-yaml)
  recipes.ts  — image → HealthcheckConfig lookup table + matchRecipe()
  patch.ts    — applies recipes to a parsed document, serializes output
  index.ts    — re-exports the public API (patch, matchRecipe, RECIPES)
```

## Data flow

```
stdin/file
    │
    ▼
parse()         js-yaml loads YAML into a plain JS object
    │
    ▼
patch()         iterates services, calls matchRecipe() per image
    │               writes recipe into service.healthcheck
    ▼
yaml.dump()     serializes the mutated object back to YAML
    │
    ▼
stdout / file / unified diff
```

## Recipe matching

`matchRecipe(image, nodePort?)` runs three passes over the `RECIPES` table, stopping at the first hit:

1. **Exact** — `image === key` or `image` starts with `key:` (handles `redis:7`)
2. **Path suffix** — each `/`-delimited segment of the image path is compared against keys (handles `library/postgres:16`)
3. **Substring** — `image.includes(key)` (handles private registries like `mycompany.io/infra/postgres-custom`)

This order ensures a more-specific match always beats a less-specific one.

## Node-like images

`node`, `express`, and `fastify` share the same probe shape (`curl -f http://localhost:<port>/health`). The port defaults to `3000` and can be overridden at the CLI level via `--node-port`. `buildRecipe()` splices the port into the test array before returning the config so the base `RECIPES` entries stay port-agnostic.

## Output modes

`patch()` has three output modes controlled by `PatchOptions`:

| Option | Behaviour |
|---|---|
| default | return full patched YAML string |
| `diff: true` | return unified diff via `createTwoFilesPatch()` from the `diff` package |
| `out` (CLI only) | `cli.ts` writes the string from `patch()` to disk with `writeFileSync` |

## Adding a new recipe

Add a key/value entry to `RECIPES` in `src/recipes.ts`. No other code changes required. If the image is node-like (HTTP health endpoint), add the key to the `NODE_LIKE` set so `--node-port` applies to it.
