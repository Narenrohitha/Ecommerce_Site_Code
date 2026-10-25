const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Home page - featured/recent products + categories
router.get('/', async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');
    const [products] = await db.query(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1
       ORDER BY p.created_at DESC LIMIT 12`
    );
    res.render('index', { title: 'Home', categories, products });
  } catch (err) {
    console.error('Home page error:', err);
    res.status(500).send('Server error loading home page.');
  }
});

// Product listing with optional category filter & search
router.get('/products', async (req, res) => {
  try {
    const { category, q } = req.query;
    const [categories] = await db.query('SELECT * FROM categories ORDER BY name ASC');

    let sql = `SELECT p.*, c.name AS category_name, c.slug AS category_slug
               FROM products p LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.is_active = 1`;
    const params = [];

    if (category) {
      sql += ' AND c.slug = ?';
      params.push(category);
    }
    if (q) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY p.created_at DESC';

    const [products] = await db.query(sql, params);
    res.render('products', {
      title: 'Products',
      categories,
      products,
      selectedCategory: category || '',
      searchQuery: q || ''
    });
  } catch (err) {
    console.error('Products page error:', err);
    res.status(500).send('Server error loading products.');
  }
});

// Single product detail page
router.get('/products/:slug', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.slug = ? AND p.is_active = 1`,
      [req.params.slug]
    );
    if (rows.length === 0) {
      return res.status(404).render('404', { title: 'Not Found' });
    }
    res.render('product-detail', { title: rows[0].name, product: rows[0] });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).send('Server error loading product.');
  }
});

module.exports = router;
