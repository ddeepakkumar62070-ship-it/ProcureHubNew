const { getPool } = require('../config/db');

async function findOwnedByUserId(userId) {
  const [rows] = await getPool().execute(
    `SELECT b.id, b.owner_user_id AS ownerUserId, u.role,
            b.name, b.business_type AS businessType, b.phone, b.address,
            b.description, b.website, b.tax_identifier AS taxIdentifier,
            b.created_at AS createdAt, b.updated_at AS updatedAt
     FROM businesses b JOIN users u ON u.id = b.owner_user_id
     WHERE b.owner_user_id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function updateOwned(userId, fields) {
  const allowed = new Map([
    ['name', 'name'],
    ['businessType', 'business_type'],
    ['phone', 'phone'],
    ['address', 'address'],
    ['description', 'description'],
    ['website', 'website'],
    ['taxIdentifier', 'tax_identifier'],
  ]);
  const updates = [];
  const values = [];
  for (const [field, column] of allowed) {
    if (Object.hasOwn(fields, field)) {
      updates.push(`${column} = ?`);
      values.push(fields[field]);
    }
  }
  if (!updates.length) return findOwnedByUserId(userId);
  values.push(userId);
  const [result] = await getPool().execute(
    `UPDATE businesses SET ${updates.join(', ')} WHERE owner_user_id = ?`,
    values,
  );
  if (!result.affectedRows) {
    const [exists] = await getPool().execute('SELECT id FROM businesses WHERE owner_user_id = ?', [userId]);
    if (!exists.length) return null;
  }
  return findOwnedByUserId(userId);
}

async function listAll({ limit, offset }) {
  const [rows] = await getPool().execute(
    `SELECT b.id, b.owner_user_id AS ownerUserId, u.role, u.email,
            b.name, b.business_type AS businessType, b.phone, b.address,
            b.description, b.website, b.tax_identifier AS taxIdentifier,
            b.created_at AS createdAt
     FROM businesses b JOIN users u ON u.id = b.owner_user_id
     ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows;
}

async function findByBusinessId(businessId) {
  const [rows] = await getPool().execute(
    `SELECT b.id, b.owner_user_id AS ownerUserId, u.role, u.email,
            b.name, b.business_type AS businessType, b.phone, b.address,
            b.description, b.website, b.tax_identifier AS taxIdentifier,
            b.created_at AS createdAt
     FROM businesses b JOIN users u ON u.id = b.owner_user_id
     WHERE b.id = ? LIMIT 1`,
    [businessId],
  );
  return rows[0] || null;
}

async function findSupplierPublicProfile(userId) {
  const [rows] = await getPool().execute(
    `SELECT b.id, b.owner_user_id AS supplierId, b.name, b.business_type AS businessType,
            b.description, b.website,
            COALESCE(AVG(r.rating), 0) AS averageRating, COUNT(r.id) AS reviewCount
     FROM businesses b JOIN users u ON u.id = b.owner_user_id
     LEFT JOIN reviews r ON r.supplier_id = u.id
     WHERE b.owner_user_id = ? AND u.role = 'SUPPLIER' AND u.is_active = TRUE
     GROUP BY b.id, b.owner_user_id, b.name, b.business_type, b.description, b.website`,
    [userId],
  );
  return rows[0] || null;
}

module.exports = { findByBusinessId, findOwnedByUserId, findSupplierPublicProfile, listAll, updateOwned };
