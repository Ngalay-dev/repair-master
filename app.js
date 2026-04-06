require('dotenv').config();

const path = require('path');
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');

const app = express();

// -------------------------
// Environment validation
// -------------------------
const requiredEnvVars = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'SESSION_SECRET'
];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// -------------------------
// Database connection
// -------------------------
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.message);
    process.exit(1);
  }
  console.log('Connected to MySQL database');
});

connection.on('error', (err) => {
  console.error('MySQL connection error:', err.message);
});

const db = connection.promise();

// -------------------------
// App setup
// -------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

// Needed behind Render / proxy
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(flash());

// Make flash + user available in all EJS views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.messages = req.flash('success');
  res.locals.errors = req.flash('error');
  
  // Set default page metadata
  res.locals.pageTitle = 'Repair Master';
  res.locals.currentPage = 'dashboard';
  
  next();
});

// -------------------------
// Middleware
// -------------------------
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in first.');
  return res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error', 'Access denied.');
  return res.redirect('/dashboard');
};

const checkStaff = (req, res, next) => {
  if (
    req.session.user &&
    (req.session.user.role === 'admin' || req.session.user.role === 'engineer')
  ) {
    return next();
  }
  req.flash('error', 'Access denied.');
  return res.redirect('/dashboard');
};

// -------------------------
// Helpers
// -------------------------
function generateRepairId(callback) {
  const sql = 'SELECT id FROM repairs ORDER BY id DESC LIMIT 1';

  connection.query(sql, (err, results) => {
    if (err) return callback(err);

    let nextNumber = 1;
    if (results.length > 0) {
      nextNumber = results[0].id + 1;
    }

    const repairId = 'REP-' + String(nextNumber).padStart(4, '0');
    callback(null, repairId);
  });
}

function validateAdminCreateUser(req, res, next) {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    req.flash('error', 'All fields are required.');
    req.flash('formData', req.body);
    return res.redirect('/users/new');
  }

  if (password.length < 8) {
    req.flash('error', 'Password must be at least 8 characters.');
    req.flash('formData', req.body);
    return res.redirect('/users/new');
  }

  const allowedRoles = ['admin', 'engineer', 'coworker'];
  if (!allowedRoles.includes(role)) {
    req.flash('error', 'Invalid role.');
    req.flash('formData', req.body);
    return res.redirect('/users/new');
  }

  const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase().trim();
  if (!allowedDomain) {
    req.flash('error', 'ALLOWED_EMAIL_DOMAIN is not configured.');
    req.flash('formData', req.body);
    return res.redirect('/users/new');
  }

  if (!email.toLowerCase().trim().endsWith(allowedDomain)) {
    req.flash('error', `Email must end with ${allowedDomain}`);
    req.flash('formData', req.body);
    return res.redirect('/users/new');
  }

  next();
}

// -------------------------
// Routes
// -------------------------
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

// -------------------------
// Auth routes
// -------------------------
app.get('/login', (req, res) => {
  return res.render('login');
});

app.post('/login', (req, res) => {
  const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
  const password = req.body.password ? req.body.password.trim() : '';

  if (!email || !password) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/login');
  }

  const sql = 'SELECT * FROM users WHERE email = ? LIMIT 1';

  connection.query(sql, [email], async (err, results) => {
    if (err) {
      console.error('Login error:', err);
      req.flash('error', 'Login failed.');
      return res.redirect('/login');
    }

    if (results.length === 0) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    const user = results[0];

    try {
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        req.flash('error', 'Invalid email or password.');
        return res.redirect('/login');
      }

      req.session.user = {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      };

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          req.flash('error', 'Login failed.');
          return res.redirect('/login');
        }

        req.flash('success', 'Login successful.');
        return res.redirect('/dashboard');
      });
    } catch (compareError) {
      console.error('Password compare error:', compareError);
      req.flash('error', 'Login failed.');
      return res.redirect('/login');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      req.flash('error', 'Failed to log out.');
      return res.redirect('/dashboard');
    }

    res.clearCookie('connect.sid');
    return res.redirect('/login');
  });
});

// -------------------------
// Dashboard
// -------------------------
app.get('/dashboard', checkAuthenticated, async (req, res) => {
  try {
    const [
      [totalResult],
      [waitingResult],
      [progressResult],
      [finishedResult]
    ] = await Promise.all([
      db.query('SELECT COUNT(*) AS total FROM repairs'),
      db.query("SELECT COUNT(*) AS total FROM repairs WHERE status = 'Waiting for approval'"),
      db.query("SELECT COUNT(*) AS total FROM repairs WHERE status = 'In progress'"),
      db.query("SELECT COUNT(*) AS total FROM repairs WHERE status = 'Finished'")
    ]);

    res.locals.pageTitle = 'Dashboard';
    res.locals.currentPage = 'dashboard';
    return res.render('index', {
      totalRepairs: totalResult[0].total,
      waitingCount: waitingResult[0].total,
      progressCount: progressResult[0].total,
      finishedCount: finishedResult[0].total
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    req.flash('error', 'Failed to load dashboard.');
    res.locals.pageTitle = 'Dashboard';
    res.locals.currentPage = 'dashboard';
    return res.render('index', {
      totalRepairs: 0,
      waitingCount: 0,
      progressCount: 0,
      finishedCount: 0
    });
  }
});

// -------------------------
// Admin-only user creation
// -------------------------
app.get('/users/new', checkAuthenticated, checkAdmin, (req, res) => {
  const formData = req.flash('formData')[0] || {};
  res.locals.pageTitle = 'Register User';
  res.locals.currentPage = 'registerUser';
  return res.render('register', { formData });
});

app.post('/users/new', checkAuthenticated, checkAdmin, validateAdminCreateUser, async (req, res) => {
  const { full_name, email, password, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const sql = `
      INSERT INTO users (full_name, email, password, role)
      VALUES (?, ?, ?, ?)
    `;

    connection.query(
      sql,
      [full_name.trim(), email.toLowerCase().trim(), hashedPassword, role],
      (err) => {
        if (err) {
          console.error('Create user error:', err);

          if (err.code === 'ER_DUP_ENTRY') {
            req.flash('error', 'That email already exists.');
          } else {
            req.flash('error', 'Failed to create user.');
          }

          req.flash('formData', req.body);
          return res.redirect('/users/new');
        }

        req.flash('success', 'User created successfully.');
        return res.redirect('/dashboard');
      }
    );
  } catch (hashError) {
    console.error('Hash error:', hashError);
    req.flash('error', 'Failed to create user.');
    req.flash('formData', req.body);
    return res.redirect('/users/new');
  }
});

// -------------------------
// Repair routes
// -------------------------
app.get('/repairs', checkAuthenticated, (req, res) => {
  const sql = 'SELECT * FROM repairs ORDER BY created_at DESC';

  connection.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to load repairs.');
      return res.redirect('/dashboard');
    }

    res.locals.pageTitle = 'Repair Records';
    res.locals.currentPage = 'repairs';
    return res.render('inventory', {
      repairs: results
    });
  });
});

app.get('/repairs/add', checkAuthenticated, checkStaff, (req, res) => {
  res.locals.pageTitle = 'Add Repair';
  res.locals.currentPage = 'addRepair';
  return res.render('addRepair');
});

app.post('/repairs/add', checkAuthenticated, checkStaff, (req, res) => {
  const {
    client_name,
    client_email,
    laptop_brand,
    laptop_model,
    serial_number,
    issue_description,
    status,
    storage_location,
    note_text,
    device_loan
  } = req.body;

  if (!client_name || !client_email || !laptop_model || !issue_description || !status) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/repairs/add');
  }

  generateRepairId((err, repairId) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to generate repair ID.');
      return res.redirect('/repairs');
    }

    const repairSql = `
      INSERT INTO repairs
      (repair_id, client_name, client_email, laptop_brand, laptop_model, serial_number, issue_description, status, storage_location, device_loan, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(
      repairSql,
      [
        repairId,
        client_name.trim(),
        client_email.trim(),
        laptop_brand || 'Apple',
        laptop_model.trim(),
        serial_number || null,
        issue_description.trim(),
        status,
        storage_location || null,
        device_loan || null,
        req.session.user.id,
        req.session.user.id
      ],
      (repairErr, repairResult) => {
        if (repairErr) {
          console.error(repairErr);
          req.flash('error', 'Failed to add repair.');
          return res.redirect('/repairs');
        }

        const newRepairDbId = repairResult.insertId;

        const insertHistory = () => {
          const historySql = `
            INSERT INTO repair_history (repair_id, old_status, new_status, changed_by, change_note)
            VALUES (?, ?, ?, ?, ?)
          `;

          connection.query(
            historySql,
            [newRepairDbId, null, status, req.session.user.id, 'Repair created'],
            (historyErr) => {
              if (historyErr) {
                console.error(historyErr);
              }

              req.flash('success', 'Repair record added successfully.');
              return res.redirect('/repairs');
            }
          );
        };

        if (note_text && note_text.trim() !== '') {
          const noteSql = `
            INSERT INTO repair_notes (repair_id, status_at_time, note_text, created_by)
            VALUES (?, ?, ?, ?)
          `;

          connection.query(
            noteSql,
            [newRepairDbId, status, note_text.trim(), req.session.user.id],
            (noteErr) => {
              if (noteErr) {
                console.error(noteErr);
              }
              insertHistory();
            }
          );
        } else {
          insertHistory();
        }
      }
    );
  });
});

app.get('/repairs/search', checkAuthenticated, (req, res) => {
  res.locals.pageTitle = 'Search Repair';
  res.locals.currentPage = 'search';
  return res.render('category', {
    repair: null
  });
});

app.post('/repairs/search', checkAuthenticated, (req, res) => {
  const repair_id = req.body.repair_id ? req.body.repair_id.trim() : '';

  if (!repair_id) {
    req.flash('error', 'Please enter a repair ID.');
    return res.redirect('/repairs/search');
  }

  const sql = 'SELECT * FROM repairs WHERE repair_id = ?';

  connection.query(sql, [repair_id], (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Search failed.');
      return res.redirect('/repairs/search');
    }

    if (results.length === 0) {
      req.flash('error', 'Repair ID not found.');
      return res.redirect('/repairs/search');
    }

    res.locals.pageTitle = 'Search Repair';
    res.locals.currentPage = 'search';
    return res.render('category', {
      repair: results[0]
    });
  });
});

app.get('/repairs/edit/:id', checkAuthenticated, checkStaff, (req, res) => {
  const sql = 'SELECT * FROM repairs WHERE id = ?';

  connection.query(sql, [req.params.id], (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to load repair.');
      return res.redirect('/repairs');
    }

    if (results.length === 0) {
      req.flash('error', 'Repair not found.');
      return res.redirect('/repairs');
    }

    res.locals.pageTitle = 'Edit Repair';
    res.locals.currentPage = 'repairs';
    return res.render('updateRepair', {
      repair: results[0]
    });
  });
});

app.post('/repairs/edit/:id', checkAuthenticated, checkStaff, (req, res) => {
  const {
    client_name,
    client_email,
    laptop_brand,
    laptop_model,
    serial_number,
    issue_description,
    status,
    storage_location,
    note_text,
    device_loan
  } = req.body;

  if (!client_name || !client_email || !laptop_model || !issue_description || !status) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/repairs/edit/' + req.params.id);
  }

  const getOldSql = 'SELECT * FROM repairs WHERE id = ?';

  connection.query(getOldSql, [req.params.id], (getErr, oldResults) => {
    if (getErr) {
      console.error(getErr);
      req.flash('error', 'Failed to load repair.');
      return res.redirect('/repairs');
    }

    if (oldResults.length === 0) {
      req.flash('error', 'Repair not found.');
      return res.redirect('/repairs');
    }

    const oldStatus = oldResults[0].status;

    const updateSql = `
      UPDATE repairs
      SET client_name = ?, client_email = ?, laptop_brand = ?, laptop_model = ?, serial_number = ?, issue_description = ?, status = ?, storage_location = ?, device_loan = ?, updated_by = ?
      WHERE id = ?
    `;

    connection.query(
      updateSql,
      [
        client_name.trim(),
        client_email.trim(),
        laptop_brand || 'Apple',
        laptop_model.trim(),
        serial_number || null,
        issue_description.trim(),
        status,
        storage_location || null,
        device_loan || null,
        req.session.user.id,
        req.params.id
      ],
      (updateErr) => {
        if (updateErr) {
          console.error(updateErr);
          req.flash('error', 'Failed to update repair.');
          return res.redirect('/repairs');
        }

        const finishUpdate = () => {
          if (oldStatus !== status) {
            const historySql = `
              INSERT INTO repair_history (repair_id, old_status, new_status, changed_by, change_note)
              VALUES (?, ?, ?, ?, ?)
            `;

            connection.query(
              historySql,
              [req.params.id, oldStatus, status, req.session.user.id, note_text || 'Status updated'],
              (historyErr) => {
                if (historyErr) {
                  console.error(historyErr);
                }
                req.flash('success', 'Repair updated successfully.');
                return res.redirect('/repairs/' + req.params.id);
              }
            );
          } else {
            req.flash('success', 'Repair updated successfully.');
            return res.redirect('/repairs/' + req.params.id);
          }
        };

        if (note_text && note_text.trim() !== '') {
          const noteSql = `
            INSERT INTO repair_notes (repair_id, status_at_time, note_text, created_by)
            VALUES (?, ?, ?, ?)
          `;

          connection.query(
            noteSql,
            [req.params.id, status, note_text.trim(), req.session.user.id],
            (noteErr) => {
              if (noteErr) {
                console.error(noteErr);
              }
              finishUpdate();
            }
          );
        } else {
          finishUpdate();
        }
      }
    );
  });
});

app.get('/repairs/:id', checkAuthenticated, (req, res) => {
  const repairSql = 'SELECT * FROM repairs WHERE id = ?';
  const notesSql = `
    SELECT rn.*, u.full_name
    FROM repair_notes rn
    JOIN users u ON rn.created_by = u.id
    WHERE rn.repair_id = ?
    ORDER BY rn.created_at DESC
  `;
  const historySql = `
    SELECT rh.*, u.full_name
    FROM repair_history rh
    JOIN users u ON rh.changed_by = u.id
    WHERE rh.repair_id = ?
    ORDER BY rh.changed_at DESC
  `;

  connection.query(repairSql, [req.params.id], (err, repairResults) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to load repair.');
      return res.redirect('/repairs');
    }

    if (repairResults.length === 0) {
      req.flash('error', 'Repair not found.');
      return res.redirect('/repairs');
    }

    connection.query(notesSql, [req.params.id], (noteErr, noteResults) => {
      if (noteErr) {
        console.error(noteErr);
        req.flash('error', 'Failed to load notes.');
        return res.redirect('/repairs');
      }

      connection.query(historySql, [req.params.id], (historyErr, historyResults) => {
        if (historyErr) {
          console.error(historyErr);
          req.flash('error', 'Failed to load history.');
          return res.redirect('/repairs');
        }

        res.locals.pageTitle = 'Repair Details';
        res.locals.currentPage = 'repairs';
        return res.render('repairDetails', {
          repair: repairResults[0],
          notes: noteResults,
          history: historyResults
        });
      });
    });
  });
});

// -------------------------
// 404
// -------------------------
app.use((req, res) => {
  return res.status(404).send('Page not found');
});

// -------------------------
// Error handler
// -------------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  return res.status(500).send('Internal Server Error');
});

// -------------------------
// Start server
// -------------------------
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});