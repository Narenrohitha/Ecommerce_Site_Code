const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const db = require('../config/db');
const { isAdmin } = require('../middleware/auth');

// ---------- Multer setup for product image uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only image files are allowed.'), ok);
  }
});

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
}

// All admin routes require admin role
router.use(isAdmin);

// ---------- Dashboard ----------
router.get('/dashboard', async (req, res) => {
  try {
    const [[{ totalProducts }]] = await db.query('SELECT COUNT(*) AS totalProducts FROM products');
    const [[{ totalOrders }]] = await db.query('SELECT COUNT(*) AS totalOrders FROM orders');
    const [[{ totalUsers }]] = await db.query("SELECT COUNT(*) AS totalUsers FROM users WHERE role = 'customer'");
    const [[{ revenue }]] = await db.query(
      "SELECT COALESCE(SUM(total_amount),0) AS revenue FROM orders WHERE status != 'cancelled'"
    );
    const [recentOrders] = await db.query(
      `SELECT o.*, u.name AS customer_name FROM orders o
       JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10`
    );

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { totalProducts, totalOrders, totalUsers, revenue },
      recentOrders
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('Server error loading dashboard.');
  }
});

// ---------- Products ----------
router.get('/products', async (req, res) => {
  try {
    const [products] = await db.query(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC`
    );
    res.render('admin/products', { title: 'Manage Products', products });
  } catch (err) {
    console.error('Admin products list error:', err);
    res.status(500).send('Server error loading products.');
  }
});

router.get('/products/new', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.render('admin/product-form', { title: 'Add Product', product: null, categories });
  } catch (err) {
    console.error('New product form error:', err);
    res.status(500).send('Server error.');
  }
});

router.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, stock, category_id, is_active } = req.body;
    const slug = slugify(name);
    const image = req.file ? '/uploads/' + req.file.filename : null;

    await db.query(
      `INSERT INTO products (category_id, name, slug, description, price, stock, image, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [category_id || null, name, slug, description || '', price, stock || 0, image, is_active ? 1 : 0]
    );

    req.flash('success', 'Product created successfully.');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Create product error:', err);
    req.flash('error', 'Could not create product.');
    res.redirect('/admin/products/new');
  }
});

router.get('/products/:id/edit', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      req.flash('error', 'Product not found.');
      return res.redirect('/admin/products');
    }
    const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.render('admin/product-form', { title: 'Edit Product', product: rows[0], categories });
  } catch (err) {
    console.error('Edit product form error:', err);
    res.status(500).send('Server error.');
  }
});

router.post('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, stock, category_id, is_active } = req.body;

    let sql = `UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, stock = ?, is_active = ?`;
    const params = [category_id || null, name, description || '', price, stock || 0, is_active ? 1 : 0];

    if (req.file) {
      sql += ', image = ?';
      params.push('/uploads/' + req.file.filename);
    }
    sql += ' WHERE id = ?';
    params.push(req.params.id);

    await db.query(sql, params);

    req.flash('success', 'Product updated successfully.');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Update product error:', err);
    req.flash('error', 'Could not update product.');
    res.redirect(`/admin/products/${req.params.id}/edit`);
  }
});

router.post('/products/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    req.flash('success', 'Product deleted.');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Delete product error:', err);
    req.flash('error', 'Could not delete product (it may be referenced by existing orders).');
    res.redirect('/admin/products');
  }
});

// ---------- Categories ----------
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.render('admin/categories', { title: 'Manage Categories', categories });
  } catch (err) {
    console.error('Admin categories error:', err);
    res.status(500).send('Server error loading categories.');
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    const slug = slugify(name);
    await db.query('INSERT INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
    req.flash('success', 'Category added.');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Add category error:', err);
    req.flash('error', 'Could not add category.');
    res.redirect('/admin/categories');
  }
});

router.post('/categories/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    req.flash('success', 'Category deleted.');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Delete category error:', err);
    req.flash('error', 'Could not delete category.');
    res.redirect('/admin/categories');
  }
});

// ---------- Orders ----------
router.get('/orders', async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email
       FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`
    );
    res.render('admin/orders', { title: 'Manage Orders', orders });
  } catch (err) {
    console.error('Admin orders list error:', err);
    res.status(500).send('Server error loading orders.');
  }
});

router.post('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      req.flash('error', 'Invalid status.');
      return res.redirect('/admin/orders');
    }
    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    req.flash('success', 'Order status updated.');
    res.redirect('/admin/orders');
  } catch (err) {
    console.error('Update order status error:', err);
    req.flash('error', 'Could not update order status.');
    res.redirect('/admin/orders');
  }
});

module.exports = router;
