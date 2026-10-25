const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// GET register page
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { title: 'Register' });
});

// POST register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirm_password, phone } = req.body;

    if (!name || !email || !password) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/register');
    }
    if (password !== confirm_password) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/register');
    }
    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/register');
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      req.flash('error', 'An account with this email already exists.');
      return res.redirect('/register');
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, phone || null, 'customer']
    );

    req.session.user = { id: result.insertId, name, email, role: 'customer' };
    req.flash('success', 'Account created successfully. Welcome!');
    res.redirect('/');
  } catch (err) {
    console.error('Register error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/register');
  }
});

// GET login page
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Login' });
});

// POST login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };

    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/login');
  }
});

// GET logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
