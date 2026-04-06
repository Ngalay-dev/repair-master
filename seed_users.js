require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const users = [
    {
      full_name: 'Admin User',
      email: 'admin@uwcsea.edu.sg',
      password: 'admin123',
      role: 'admin'
    },
    {
      full_name: 'Onsite Engineer',
      email: 'engineer@uwcsea.edu.sg',
      password: 'engineer123',
      role: 'engineer'
    },
    {
      full_name: 'Coworker User',
      email: 'coworker@uwcsea.edu.sg',
      password: 'coworker123',
      role: 'coworker'
    }
  ];

  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 12);

    await connection.query(
      `
      INSERT INTO users (full_name, email, password, role)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        password = VALUES(password),
        role = VALUES(role)
      `,
      [user.full_name, user.email, hashedPassword, user.role]
    );

    console.log(`Updated ${user.email} -> ${hashedPassword} (len=${hashedPassword.length})`);
  }

  const [rows] = await connection.query(
    'SELECT email, LENGTH(password) AS len FROM users ORDER BY id'
  );

  console.table(rows);

  await connection.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
});