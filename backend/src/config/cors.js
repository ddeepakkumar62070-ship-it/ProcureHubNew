const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function parseConfiguredOrigins(value) {
  if (!value?.trim()) return [];
  return value.split(',').map((entry) => {
    const origin = entry.trim();
    if (!origin || origin === '*') {
      throw new Error('FRONTEND_ORIGINS must contain explicit origins, not a wildcard.');
    }

    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('Each FRONTEND_ORIGINS entry must be a valid origin URL.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.origin !== origin
        || parsed.username
        || parsed.password) {
      throw new Error('Each FRONTEND_ORIGINS entry must be an origin without credentials, path, query, or fragment.');
    }
    return origin;
  });
}

function getAllowedOrigins({
  nodeEnv = process.env.NODE_ENV,
  configured = process.env.FRONTEND_ORIGINS,
} = {}) {
  const configuredOrigins = parseConfiguredOrigins(configured);
  if (nodeEnv === 'production') {
    if (!configuredOrigins.length) {
      throw new Error('FRONTEND_ORIGINS must explicitly configure at least one HTTPS frontend origin in production.');
    }
    if (configuredOrigins.some((origin) => !origin.startsWith('https://'))) {
      throw new Error('Production FRONTEND_ORIGINS entries must use HTTPS.');
    }
    return [...new Set(configuredOrigins)];
  }
  return [...new Set([...DEVELOPMENT_ORIGINS, ...configuredOrigins])];
}

module.exports = { getAllowedOrigins };
