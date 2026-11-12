const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { getAllowedOrigins } = require('../src/config/cors');
const { app, configureProxyTrust } = require('../src/server');

let server;
let apiBase;

before(async () => {
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  apiBase = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('allows only configured browser origins and requires HTTPS origins in production', async () => {
  const allowedResponse = await fetch(`${apiBase}/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedResponse.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowedResponse.headers.get('access-control-allow-credentials'), null);

  const loopbackResponse = await fetch(`${apiBase}/health`, {
    headers: { Origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(loopbackResponse.status, 200);
  assert.equal(loopbackResponse.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');

  const rejectedResponse = await fetch(`${apiBase}/health`, {
    headers: { Origin: 'https://untrusted.example' },
  });
  assert.equal(rejectedResponse.status, 403);
  assert.equal(rejectedResponse.headers.get('access-control-allow-origin'), null);

  assert.throws(
    () => getAllowedOrigins({ nodeEnv: 'production', configured: '' }),
    /must explicitly configure at least one HTTPS frontend origin/,
  );
  assert.throws(
    () => getAllowedOrigins({ nodeEnv: 'production', configured: 'http://frontend.example' }),
    /must use HTTPS/,
  );
  assert.throws(
    () => getAllowedOrigins({ nodeEnv: 'production', configured: '*' }),
    /not a wildcard/,
  );
  assert.deepEqual(
    getAllowedOrigins({ nodeEnv: 'production', configured: 'https://frontend.example' }),
    ['https://frontend.example'],
  );
});

test('limits login and registration attempts with HTTP 429 responses', async () => {
  let login429Count = 0;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (response.status === 429) login429Count += 1;
    else assert.equal(response.status, 400);
  }
  assert.equal(login429Count, 1);

  let registration429Count = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (response.status === 429) registration429Count += 1;
    else assert.equal(response.status, 400);
  }
  assert.equal(registration429Count, 1);
});

test('trusts one proxy hop only in production or on Render', () => {
  configureProxyTrust(app, { NODE_ENV: 'development' });
  assert.equal(app.get('trust proxy'), false);

  configureProxyTrust(app, { NODE_ENV: 'test', RENDER: 'true' });
  assert.equal(app.get('trust proxy'), 1);

  configureProxyTrust(app, { NODE_ENV: 'production' });
  assert.equal(app.get('trust proxy'), 1);

  configureProxyTrust(app, { NODE_ENV: 'test' });
  assert.equal(app.get('trust proxy'), false);
  configureProxyTrust(app);
});

test('enforces login rate limits by forwarded client IP behind one trusted proxy hop', async () => {
  const originalTrustProxy = app.get('trust proxy');
  configureProxyTrust(app, { NODE_ENV: 'test', RENDER: 'true' });
  try {
    let rateLimited = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.27',
        },
        body: JSON.stringify({}),
      });
      if (response.status === 429) rateLimited += 1;
      else assert.equal(response.status, 400);
    }
    assert.equal(rateLimited, 1);
  } finally {
    app.set('trust proxy', originalTrustProxy);
  }
});
