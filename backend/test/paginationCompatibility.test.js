const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { after, before, test } = require('node:test');
const { app } = require('../src/server');
const { closeDatabase, initializeDatabase } = require('../src/config/db');
const businessRepository = require('../src/repositories/businessRepository');
const complaintRepository = require('../src/repositories/complaintRepository');
const financeRepository = require('../src/repositories/financeRepository');
const notificationRepository = require('../src/repositories/notificationRepository');
const procurementRepository = require('../src/repositories/procurementRepository');
const productRepository = require('../src/repositories/productRepository');
const refundRepository = require('../src/repositories/refundRepository');
const returnRepository = require('../src/repositories/returnRepository');
const userRepository = require('../src/repositories/userRepository');
const { limitClause, paginationClause, parsePagination } = require('../src/utils/pagination');

const testSecret = 'pagination-regression-test-secret-32-characters';
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = testSecret;

let server;
let apiBase;
const token = jwt.sign({ id: 17, role: 'BUYER', email: 'pagination@example.test' }, testSecret);

before(async () => {
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  apiBase = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

async function getApi(path) {
  return fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test('pagination defaults missing and malformed parameters, caps page size, and accepts valid integers', () => {
  assert.deepEqual(parsePagination({}), { limit: 50, offset: 0 });
  assert.deepEqual(parsePagination({ limit: '25', offset: '75' }), { limit: 25, offset: 75 });
  assert.deepEqual(parsePagination({ limit: '1000000', offset: '9007199254740991' }), {
    limit: 100,
    offset: Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(parsePagination({ limit: '999999999999999999999999999999999999' }), {
    limit: 100,
    offset: 0,
  });

  for (const limit of ['-1', '1.5', '12items']) {
    assert.deepEqual(parsePagination({ limit }), { limit: 50, offset: 0 }, `limit=${limit}`);
  }
  for (const offset of ['-1', '1.5', '12items', '9007199254740992']) {
    assert.deepEqual(parsePagination({ offset }), { limit: 50, offset: 0 }, `offset=${offset}`);
  }
});

test('pagination SQL accepts only safe integer literals', () => {
  assert.equal(paginationClause(25, 75), 'LIMIT 25 OFFSET 75');
  assert.equal(paginationClause(1000, 0), 'LIMIT 100 OFFSET 0');
  assert.equal(limitClause(5), 'LIMIT 5');
  assert.throws(() => paginationClause(1.5, 0), /safe, non-negative integers/);
  assert.throws(() => paginationClause(10, -1), /safe, non-negative integers/);
  assert.throws(() => paginationClause('10; DROP TABLE users', 0), /safe, non-negative integers/);
  assert.throws(
    () => paginationClause(1.5, 0),
    (error) => error instanceof RangeError
      && error.message === 'Pagination values must be safe, non-negative integers and limit must be positive.',
  );
  assert.throws(() => limitClause('5; DROP TABLE users'), /positive safe integer/);
});

test('GET /orders preserves its response and passes valid/default pagination', async (t) => {
  t.mock.method(userRepository, 'findById', async () => ({
    id: 17,
    role: 'BUYER',
    isActive: true,
  }));
  const calls = [];
  t.mock.method(procurementRepository, 'listOrders', async (options) => {
    calls.push(options);
    return [{ id: 42 }];
  });

  const validResponse = await getApi('/orders?limit=20&offset=30');
  assert.equal(validResponse.status, 200);
  assert.deepEqual(await validResponse.json(), { orders: [{ id: 42 }] });

  const missingResponse = await getApi('/orders');
  assert.equal(missingResponse.status, 200);
  assert.deepEqual(await missingResponse.json(), { orders: [{ id: 42 }] });
  assert.deepEqual(calls.map(({ limit, offset }) => ({ limit, offset })), [
    { limit: 20, offset: 30 },
    { limit: 50, offset: 0 },
  ]);
});

test('GET /complaints preserves its response and safely normalizes invalid pagination', async (t) => {
  t.mock.method(userRepository, 'findById', async () => ({
    id: 17,
    role: 'BUYER',
    isActive: true,
  }));
  const calls = [];
  t.mock.method(complaintRepository, 'listComplaints', async (options) => {
    calls.push(options);
    return [{ id: 51 }];
  });

  const response = await getApi('/complaints?limit=-2&offset=2.5');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { complaints: [{ id: 51 }] });
  assert.deepEqual(calls.map(({ limit, offset }) => ({ limit, offset })), [
    { limit: 50, offset: 0 },
  ]);
});

test('all paginated repository queries use safe LIMIT clauses and preserve filter parameter order', async (t) => {
  const statements = [];
  const fakePool = {
    async getConnection() {
      return { ping: async () => {}, release() {} };
    },
    async execute(sql, params) {
      statements.push({ sql, params });
      return [[], []];
    },
    async end() {},
  };
  t.mock.method(mysql, 'createPool', () => fakePool);
  await initializeDatabase();
  try {
    await businessRepository.listAll({ limit: 20, offset: 30 });
    await complaintRepository.listComplaints({ userId: 51, role: 'BUYER', limit: 20, offset: 30 });
    await financeRepository.listInvoices({ userId: 51, role: 'SUPPLIER', limit: 20, offset: 30 });
    await notificationRepository.listForUser(51, { limit: 20, offset: 30 });
    await notificationRepository.recentForUser(51);
    await procurementRepository.listRequests({
      userId: 51, role: 'BUYER', status: 'OPEN', limit: 20, offset: 30,
    });
    await procurementRepository.listQuotations({ userId: 51, role: 'BUYER', limit: 20, offset: 30 });
    await procurementRepository.listOrders({ userId: 61, role: 'SUPPLIER', limit: 20, offset: 30 });
    await procurementRepository.listReviews({ userId: 61, role: 'BUYER', limit: 20, offset: 30 });
    await productRepository.list({
      supplierId: 61, search: 'coffee', categoryId: 71, limit: 20, offset: 30,
    });
    await productRepository.listSupplierInventory(61, { limit: 20, offset: 30 });
    await refundRepository.listRefunds({ userId: 51, role: 'SUPPLIER', limit: 20, offset: 30 });
    await returnRepository.listReturns({ userId: 61, role: 'SUPPLIER', limit: 20, offset: 30 });
  } finally {
    await closeDatabase();
  }

  const expectedParameters = [
    [],
    [51, 51],
    [51],
    [51],
    [51],
    [51, 'OPEN'],
    [51],
    [61],
    [61],
    [61, '%coffee%', '%coffee%', '%coffee%', '%coffee%', 71],
    [61],
    [51],
    [61],
  ];
  assert.equal(statements.length, expectedParameters.length);
  for (const [index, { sql, params }] of statements.entries()) {
    assert.match(sql, /LIMIT (?:20 OFFSET 30|5)(?:\s|$)/, `query ${index + 1}`);
    assert.doesNotMatch(sql, /LIMIT\s+\?|OFFSET\s+\?/, `query ${index + 1}`);
    assert.deepEqual(params, expectedParameters[index], `query ${index + 1} parameters`);
  }
});
