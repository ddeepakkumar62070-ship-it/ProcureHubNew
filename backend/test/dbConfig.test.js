const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { getDatabaseConfig } = require('../src/config/db');

const databaseEnvironment = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_SSL', 'DB_SSL_CA'];

function withDatabaseEnvironment(overrides, callback) {
  const original = Object.fromEntries(databaseEnvironment.map((key) => [key, process.env[key]]));
  for (const key of databaseEnvironment) {
    if (Object.hasOwn(overrides, key)) process.env[key] = overrides[key];
    else delete process.env[key];
  }
  Object.assign(process.env, {
    DB_HOST: 'database.example.test',
    DB_PORT: '4000',
    DB_USER: 'test-user',
    DB_PASSWORD: 'test-password',
    DB_NAME: 'test-database',
    ...overrides,
  });

  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('database SSL is disabled when DB_SSL is absent', () => {
  withDatabaseEnvironment({}, () => {
    assert.equal(Object.hasOwn(getDatabaseConfig(), 'ssl'), false);
  });
});

test('database SSL is disabled when DB_SSL is false', () => {
  withDatabaseEnvironment({ DB_SSL: 'false' }, () => {
    assert.equal(Object.hasOwn(getDatabaseConfig(), 'ssl'), false);
  });
});

test('database SSL verifies certificates when DB_SSL is true', () => {
  withDatabaseEnvironment({ DB_SSL: 'true' }, () => {
    assert.deepEqual(getDatabaseConfig().ssl, { rejectUnauthorized: true });
  });
});

test('database SSL uses the CA certificate at DB_SSL_CA when provided', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'procurehub-db-ca-'));
  const caPath = path.join(directory, 'ca.pem');
  const certificate = 'test CA certificate';

  try {
    fs.writeFileSync(caPath, certificate);
    withDatabaseEnvironment({ DB_SSL: 'true', DB_SSL_CA: caPath }, () => {
      const { ssl } = getDatabaseConfig();
      assert.deepEqual(ssl, { rejectUnauthorized: true, ca: Buffer.from(certificate) });
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
