const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseUnsignedInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parsePageLimit(value, maxLimit) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const normalized = value.replace(/^0+(?=\d)/, '');
  const maximum = String(maxLimit);
  if (normalized.length > maximum.length
      || (normalized.length === maximum.length && normalized > maximum)) {
    return maxLimit;
  }
  return Number(normalized);
}

function parsePagination(query, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const requestedLimit = parsePageLimit(query.limit, maxLimit);
  const requestedOffset = parseUnsignedInteger(query.offset);
  const limit = requestedLimit > 0
    ? Math.min(requestedLimit, maxLimit)
    : defaultLimit;
  const offset = requestedOffset ?? 0;
  return { limit, offset };
}

function paginationClause(limit = DEFAULT_LIMIT, offset = 0) {
  if (!Number.isSafeInteger(limit) || limit < 1
      || !Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('Pagination values must be safe, non-negative integers and limit must be positive.');
  }
  return `LIMIT ${Math.min(limit, MAX_LIMIT)} OFFSET ${offset}`;
}

function limitClause(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('Limit must be a positive safe integer.');
  }
  return `LIMIT ${Math.min(limit, MAX_LIMIT)}`;
}

module.exports = { limitClause, paginationClause, parsePagination };
