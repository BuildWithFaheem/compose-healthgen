import yaml from 'js-yaml';
import { createTwoFilesPatch } from 'diff';
import { parse } from './parse.js';
import { matchRecipe } from './recipes.js';

export interface PatchOptions {
  skipExisting?: boolean;
  nodePort?: number;
  diff?: boolean;
  filename?: string;
}

export function patch(content: string, options: PatchOptions = {}): string {
  const { skipExisting = false, nodePort = 3000, diff = false, filename = 'docker-compose.yml' } = options;

  const doc = parse(content);

  for (const [, service] of Object.entries(doc.services)) {
    if (skipExisting && service.healthcheck !== undefined) continue;

    const image = service.image;
    if (!image) continue;

    const recipe = matchRecipe(image, nodePort);
    if (!recipe) continue;

    service.healthcheck = recipe as unknown as Record<string, unknown>;
  }

  const patched = yaml.dump(doc, { lineWidth: -1 });

  if (diff) {
    return createTwoFilesPatch(filename, filename, content, patched);
  }

  return patched;
}
