const { getPool } = require('../config/db');

async function list({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE is_active = TRUE';
  const [rows] = await getPool().execute(
    `SELECT id, name, description, is_active AS isActive
     FROM categories ${where} ORDER BY name`,
  );
  return rows;
}

async function create({ name, description }) {
  const [result] = await getPool().execute(
    'INSERT INTO categories (name, description) VALUES (?, ?)',
    [name, description || null],
  );
  return { id: result.insertId, name, description: description || null, isActive: true };
}

async function update(id, { name, description, isActive }) {
  const updates = [];
  const values = [];
  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (isActive !== undefined) {
    updates.push('is_active = ?');
    values.push(isActive);
  }
  if (updates.length) {
    values.push(id);
    await getPool().execute(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  const [rows] = await getPool().execute(
    'SELECT id, name, description, is_active AS isActive FROM categories WHERE id = ?',
    [id],
  );
  return rows[0] || null;
}

module.exports = { create, list, update };
