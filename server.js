require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const methodOverride = require('method-override');
const flash = require('connect-flash');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = require('./config/db');
const { attachUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Middleware ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Session store in MySQL (persists across restarts) ----------
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

app.use(session({
  key: 'ecommerce_sid',
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true
  }
}));

app.use(flash());
app.use(attachUser);

// Make flash messages available in every view
app.use((req, res, next) => {
  res.locals.successMsg = req.flash('success');
  res.locals.errorMsg = req.flash('error');
  next();
});

// ---------- Routes ----------
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/products'));
app.use('/', require('./routes/cart'));
app.use('/', require('./routes/orders'));
app.use('/admin', require('./routes/admin'));

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong on the server.');
});

// ---------- Bootstrap default admin account, then start server ----------
async function bootstrapAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';
    if (!email || !password) return;

    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      const hashed = await bcrypt.hash(password, 10);
      await db.query(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [name, email, hashed, 'admin']
      );
      console.log(`Admin account created: ${email}`);
    }
  } catch (err) {
    console.error('Admin bootstrap failed (check DB connection/schema):', err.message);
  }
}

bootstrapAdmin().finally(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
