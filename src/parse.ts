import yaml from 'js-yaml';

export interface ServiceConfig {
  image?: string;
  healthcheck?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ComposeFile {
  services: Record<string, ServiceConfig>;
  [key: string]: unknown;
}

export function parse(content: string): ComposeFile {
  const doc = yaml.load(content);
  if (
    doc === null ||
    typeof doc !== 'object' ||
    !('services' in (doc as object)) ||
    (doc as { services: unknown }).services === null ||
    typeof (doc as { services: unknown }).services !== 'object'
  ) {
    throw new Error("Invalid compose file: missing 'services' key");
  }
  return doc as ComposeFile;
}
