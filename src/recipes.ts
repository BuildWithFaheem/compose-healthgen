export interface HealthcheckConfig {
  test: string[];
  interval: string;
  timeout: string;
  retries: number;
  start_period: string;
}

// Keys are image name stems. matchRecipe() tries: exact → path-suffix → substring.
// Add new images here via PR — no plugin system needed.
export const RECIPES: Record<string, HealthcheckConfig> = {
  postgres: {
    test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-postgres}'],
    interval: '10s',
    timeout: '5s',
    retries: 5,
    start_period: '10s',
  },
  redis: {
    test: ['CMD', 'redis-cli', 'ping'],
    interval: '10s',
    timeout: '3s',
    retries: 3,
    start_period: '5s',
  },
  nginx: {
    test: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
    interval: '30s',
    timeout: '10s',
    retries: 3,
    start_period: '10s',
  },
  mysql: {
    test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
    interval: '10s',
    timeout: '5s',
    retries: 5,
    start_period: '30s',
  },
  mariadb: {
    test: ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized'],
    interval: '10s',
    timeout: '5s',
    retries: 3,
    start_period: '10s',
  },
  mongo: {
    test: ['CMD-SHELL', "mongosh --eval \"db.adminCommand('ping')\""],
    interval: '10s',
    timeout: '5s',
    retries: 3,
    start_period: '30s',
  },
  mongodb: {
    test: ['CMD-SHELL', "mongosh --eval \"db.adminCommand('ping')\""],
    interval: '10s',
    timeout: '5s',
    retries: 3,
    start_period: '30s',
  },
  rabbitmq: {
    test: ['CMD', 'rabbitmq-diagnostics', 'check_port_connectivity'],
    interval: '15s',
    timeout: '10s',
    retries: 3,
    start_period: '30s',
  },
  memcached: {
    test: ['CMD-SHELL', 'echo stats | nc -w1 localhost 11211 || exit 1'],
    interval: '15s',
    timeout: '5s',
    retries: 3,
    start_period: '5s',
  },
  elasticsearch: {
    test: ['CMD-SHELL', 'curl -f http://localhost:9200/_cluster/health || exit 1'],
    interval: '20s',
    timeout: '10s',
    retries: 5,
    start_period: '30s',
  },
  // node-like images: port is injected by matchRecipe() via nodePort arg
  node: {
    test: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
    interval: '30s',
    timeout: '10s',
    retries: 3,
    start_period: '15s',
  },
  express: {
    test: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
    interval: '30s',
    timeout: '10s',
    retries: 3,
    start_period: '15s',
  },
  fastify: {
    test: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
    interval: '30s',
    timeout: '10s',
    retries: 3,
    start_period: '15s',
  },
};

const NODE_LIKE = new Set(['node', 'express', 'fastify']);

function buildRecipe(key: string, nodePort: number): HealthcheckConfig {
  const base = RECIPES[key];
  if (NODE_LIKE.has(key) && nodePort !== 3000) {
    return {
      ...base,
      test: [`CMD-SHELL`, `curl -f http://localhost:${nodePort}/health || exit 1`],
    };
  }
  return { ...base };
}

// Matching order: exact → path-suffix → substring. First hit wins.
export function matchRecipe(image: string, nodePort = 3000): HealthcheckConfig | null {
  const withoutTag = image.split(':')[0];
  const parts = withoutTag.split('/');

  for (const key of Object.keys(RECIPES)) {
    if (image === key || withoutTag === key || image.startsWith(`${key}:`)) {
      return buildRecipe(key, nodePort);
    }
  }

  for (const key of Object.keys(RECIPES)) {
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join('/');
      if (suffix === key || suffix.startsWith(`${key}:`) || suffix.startsWith(`${key}/`)) {
        return buildRecipe(key, nodePort);
      }
    }
  }

  for (const key of Object.keys(RECIPES)) {
    if (image.includes(key)) {
      return buildRecipe(key, nodePort);
    }
  }

  return null;
}
