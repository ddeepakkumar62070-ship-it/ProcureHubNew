const { getPool } = require('../config/db');

async function findByEmail(email) {
  const [rows] = await getPool().execute(
    `SELECT u.id, u.name, u.email, u.password_hash AS passwordHash, u.role,
            u.is_active AS isActive, b.name AS businessName
     FROM users u
     LEFT JOIN businesses b ON b.owner_user_id = u.id
     WHERE u.email = ?
     LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await getPool().execute(
    `SELECT u.id, u.name, u.email, u.role, u.is_active AS isActive,
            b.name AS businessName
     FROM users u
     LEFT JOIN businesses b ON b.owner_user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function create({ name, email, passwordHash, role, businessName }) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role],
    );
    await connection.execute(
      'INSERT INTO businesses (owner_user_id, name) VALUES (?, ?)',
      [result.insertId, businessName],
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

async function listUsers() {
  const [rows] = await getPool().execute(
    `SELECT u.id, u.name, u.email, u.role, u.is_active AS isActive,
            b.name AS businessName, u.created_at AS createdAt
     FROM users u
     LEFT JOIN businesses b ON b.owner_user_id = u.id
     ORDER BY u.created_at DESC`,
  );
  return rows;
}

async function setActive(id, isActive) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute(
      'SELECT id, role FROM users WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!users.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    if (!isActive && users[0].role === 'ADMIN') {
      const [admins] = await connection.execute(
        `SELECT id FROM users
         WHERE role = 'ADMIN' AND is_active = TRUE AND id <> ?
         LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (!admins.length) {
        await connection.rollback();
        return 'LAST_ACTIVE_ADMIN';
      }
    }
    await connection.execute('UPDATE users SET is_active = ? WHERE id = ?', [isActive, id]);
    await connection.commit();
    return 'UPDATED';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { create, findByEmail, findById, listUsers, setActive };
