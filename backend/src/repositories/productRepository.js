const { getPool } = require('../config/db');
const { paginationClause } = require('../utils/pagination');

const PRODUCT_SELECT = `
  SELECT p.id, p.supplier_id AS supplierId, p.name, c.name AS category,
         p.unit, p.price, COALESCE(i.quantity, 0) AS stock, p.description,
         p.is_active AS isActive, b.name AS supplierName
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN inventory i ON i.product_id = p.id
  JOIN users u ON u.id = p.supplier_id
  JOIN businesses b ON b.owner_user_id = p.supplier_id`;

async function list({ supplierId, search, categoryId, limit = 50, offset = 0, includeInactive = false } = {}) {
  const conditions = [];
  const values = [];
  if (supplierId !== undefined) {
    conditions.push('p.supplier_id = ?');
    values.push(supplierId);
  }
  if (!includeInactive) conditions.push('p.is_active = TRUE AND u.is_active = TRUE');
  if (search) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ? OR b.name LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (categoryId !== undefined) {
    conditions.push('p.category_id = ?');
    values.push(categoryId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await getPool().execute(
    `${PRODUCT_SELECT} ${where} ORDER BY p.created_at DESC ${paginationClause(limit, offset)}`,
    values,
  );
  return rows;
}

async function findById(id, { includeInactive = false, includeInactiveSupplier = false } = {}) {
  const conditions = ['p.id = ?'];
  if (!includeInactive) conditions.push('p.is_active = TRUE');
  if (!includeInactiveSupplier) conditions.push('u.is_active = TRUE');
  const [rows] = await getPool().execute(
    `${PRODUCT_SELECT}
     WHERE ${conditions.join(' AND ')} LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function create({ supplierId, name, category, unit, price, stock, description }) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [categories] = await connection.execute(
      'SELECT id FROM categories WHERE name = ? AND is_active = TRUE LIMIT 1',
      [category],
    );
    if (!categories.length) {
      const error = new Error('Category not found or inactive.');
      error.code = 'CATEGORY_NOT_FOUND';
      throw error;
    }

    const [result] = await connection.execute(
      `INSERT INTO products (supplier_id, category_id, name, unit, price, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [supplierId, categories[0].id, name, unit, price, description],
    );
    await connection.execute(
      'INSERT INTO inventory (product_id, quantity) VALUES (?, ?)',
      [result.insertId, stock],
    );
    await connection.commit();
    return findById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function update(id, { supplierId, isAdmin, fields }) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [products] = await connection.execute(
      'SELECT id, supplier_id AS supplierId FROM products WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!products.length) {
      await connection.rollback();
      return null;
    }
    if (!isAdmin && Number(products[0].supplierId) !== Number(supplierId)) {
      const error = new Error('You cannot modify this product.');
      error.code = 'FORBIDDEN';
      throw error;
    }

    const productUpdates = [];
    const productValues = [];
    for (const [field, column] of [
      ['name', 'name'],
      ['unit', 'unit'],
      ['price', 'price'],
      ['description', 'description'],
      ['isActive', 'is_active'],
    ]) {
      if (Object.hasOwn(fields, field)) {
        productUpdates.push(`${column} = ?`);
        productValues.push(fields[field]);
      }
    }

    if (Object.hasOwn(fields, 'category')) {
      const [categories] = await connection.execute(
        'SELECT id FROM categories WHERE name = ? AND is_active = TRUE LIMIT 1',
        [fields.category],
      );
      if (!categories.length) {
        const error = new Error('Category not found or inactive.');
        error.code = 'CATEGORY_NOT_FOUND';
        throw error;
      }
      productUpdates.push('category_id = ?');
      productValues.push(categories[0].id);
    }

    if (productUpdates.length) {
      productValues.push(id);
      await connection.execute(`UPDATE products SET ${productUpdates.join(', ')} WHERE id = ?`, productValues);
    }
    if (Object.hasOwn(fields, 'stock')) {
      const [inventory] = await connection.execute(
        'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ? FOR UPDATE',
        [id],
      );
      const reserved = inventory.length ? Number(inventory[0].reserved_quantity) : 0;
      if (Number(fields.stock) < reserved) {
        const error = new Error('Stock cannot be lower than the quantity already reserved for orders.');
        error.code = 'STOCK_RESERVED';
        throw error;
      }
      if (inventory.length) {
        await connection.execute('UPDATE inventory SET quantity = ? WHERE product_id = ?', [fields.stock, id]);
      } else {
        await connection.execute('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)', [id, fields.stock]);
      }
    }
    await connection.commit();
    return findById(id, { includeInactive: true, includeInactiveSupplier: isAdmin });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function remove(id, { supplierId, isAdmin }) {
  const [rows] = await getPool().execute(
    'SELECT supplier_id AS supplierId FROM products WHERE id = ?',
    [id],
  );
  if (!rows.length) return 'NOT_FOUND';
  if (!isAdmin && Number(rows[0].supplierId) !== Number(supplierId)) return 'FORBIDDEN';
  const [result] = await getPool().execute('UPDATE products SET is_active = FALSE WHERE id = ?', [id]);
  return result.affectedRows ? 'DEACTIVATED' : 'NOT_FOUND';
}

async function listCategories() {
  const [rows] = await getPool().execute(
    'SELECT id, name, description FROM categories WHERE is_active = TRUE ORDER BY name',
  );
  return rows;
}

async function findInventory(id) {
  const [rows] = await getPool().execute(
    `SELECT i.product_id AS productId, p.name, i.quantity, i.reserved_quantity AS reservedQuantity,
            i.quantity - i.reserved_quantity AS availableQuantity
     FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.product_id = ?`,
    [id],
  );
  return rows[0] || null;
}

async function listSupplierInventory(supplierId, { limit = 50, offset = 0 } = {}) {
  const [rows] = await getPool().execute(
    `SELECT i.product_id AS productId, p.name, i.quantity, i.reserved_quantity AS reservedQuantity,
            i.quantity - i.reserved_quantity AS availableQuantity
     FROM inventory i JOIN products p ON p.id = i.product_id
     WHERE p.supplier_id = ? ORDER BY p.name ${paginationClause(limit, offset)}`,
    [supplierId],
  );
  return rows;
}

async function setInventoryQuantity(productId, supplierId, quantity) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [products] = await connection.execute(
      'SELECT id FROM products WHERE id = ? AND supplier_id = ? FOR UPDATE',
      [productId, supplierId],
    );
    if (!products.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const [inventory] = await connection.execute(
      'SELECT reserved_quantity FROM inventory WHERE product_id = ? FOR UPDATE',
      [productId],
    );
    if (!inventory.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    if (Number(quantity) < Number(inventory[0].reserved_quantity)) {
      await connection.rollback();
      return 'STOCK_RESERVED';
    }
    await connection.execute('UPDATE inventory SET quantity = ? WHERE product_id = ?', [quantity, productId]);
    await connection.commit();
    return findInventory(productId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  create, findById, findInventory, list, listCategories, listSupplierInventory,
  remove, setInventoryQuantity, update,
};
