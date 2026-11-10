const bcrypt = require('bcryptjs');
const { closeDatabase, initializeDatabase, getPool } = require('../config/db');

const demoUsers = [
  {
    name: 'Admin User',
    email: 'admin@procurehub.com',
    role: 'ADMIN',
    businessName: 'ProcureHub Admin',
    passwordKey: 'DEMO_ADMIN_PASSWORD',
  },
  {
    name: 'Aditi Sharma',
    email: 'buyer@procurehub.com',
    role: 'BUYER',
    businessName: 'Blue Lotus Restaurant',
    passwordKey: 'DEMO_BUYER_PASSWORD',
  },
  {
    name: 'Rohan Mehta',
    email: 'supplier@procurehub.com',
    role: 'SUPPLIER',
    businessName: 'Apex Supplies',
    passwordKey: 'DEMO_SUPPLIER_PASSWORD',
  },
];

const categories = ['Groceries', 'Cooking Oils', 'Bakery'];

async function seedDatabase() {
  const missingPasswords = demoUsers
    .map((user) => user.passwordKey)
    .filter((key) => !process.env[key]);
  if (missingPasswords.length) {
    throw new Error(`Set these environment variables before seeding: ${missingPasswords.join(', ')}`);
  }

  await initializeDatabase();
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const name of categories) {
      await connection.execute(
        'INSERT IGNORE INTO categories (name) VALUES (?)',
        [name],
      );
    }

    for (const user of demoUsers) {
      const [rows] = await connection.execute(
        'SELECT id, role FROM users WHERE email = ? FOR UPDATE',
        [user.email],
      );
      let userId;
      if (rows.length) {
        if (rows[0].role !== user.role) {
          throw new Error(`Existing demo account ${user.email} has a different role; refusing to change it.`);
        }
        userId = rows[0].id;
      } else {
        const passwordHash = await bcrypt.hash(process.env[user.passwordKey], 12);
        const [result] = await connection.execute(
          'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
          [user.name, user.email, passwordHash, user.role],
        );
        userId = result.insertId;
      }

      const [businesses] = await connection.execute(
        'SELECT id FROM businesses WHERE owner_user_id = ?',
        [userId],
      );
      if (!businesses.length) {
        await connection.execute(
          'INSERT INTO businesses (owner_user_id, name) VALUES (?, ?)',
          [userId, user.businessName],
        );
      }
    }

    await connection.commit();
    console.log(`Seed complete: ${categories.length} categories and ${demoUsers.length} demo users are present.`);
    console.log('Demo user password values are read from the environment and stored only as bcrypt hashes.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await closeDatabase();
  }
}

seedDatabase().catch(async (error) => {
  console.error(`Database seed failed: ${error.message}`);
  try {
    await closeDatabase();
  } catch (closeError) {
    console.error(`Could not close the database pool: ${closeError.message}`);
  }
  process.exitCode = 1;
});
