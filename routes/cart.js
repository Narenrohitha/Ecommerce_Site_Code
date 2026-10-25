const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isLoggedIn } = require('../middleware/auth');

// View cart
router.get('/cart', isLoggedIn, async (req, res) => {
  try {
    const [items] = await db.query(
      `SELECT ci.id AS cart_id, ci.quantity, p.id AS product_id, p.name, p.price, p.image, p.stock
       FROM cart_items ci JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?`,
      [req.session.user.id]
    );
    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
    res.render('cart', { title: 'Your Cart', items, total });
  } catch (err) {
    console.error('Cart view error:', err);
    res.status(500).send('Server error loading cart.');
  }
});

// Add item to cart
router.post('/cart/add', isLoggedIn, async (req, res) => {
  try {
    const { product_id, quantity } = req.body;
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    const [products] = await db.query('SELECT * FROM products WHERE id = ? AND is_active = 1', [product_id]);
    if (products.length === 0) {
      req.flash('error', 'Product not found.');
      return res.redirect('back');
    }

    const [existing] = await db.query(
      'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?',
      [req.session.user.id, product_id]
    );

    if (existing.length > 0) {
      await db.query(
        'UPDATE cart_items SET quantity = quantity + ? WHERE id = ?',
        [qty, existing[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
        [req.session.user.id, product_id, qty]
      );
    }

    req.flash('success', 'Item added to cart.');
    res.redirect('/cart');
  } catch (err) {
    console.error('Add to cart error:', err);
    req.flash('error', 'Could not add item to cart.');
    res.redirect('back');
  }
});

// Update quantity
router.post('/cart/update/:cartId', isLoggedIn, async (req, res) => {
  try {
    const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
    await db.query(
      'UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?',
      [qty, req.params.cartId, req.session.user.id]
    );
    res.redirect('/cart');
  } catch (err) {
    console.error('Update cart error:', err);
    res.redirect('/cart');
  }
});

// Remove item
router.post('/cart/remove/:cartId', isLoggedIn, async (req, res) => {
  try {
    await db.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [req.params.cartId, req.session.user.id]);
    req.flash('success', 'Item removed from cart.');
    res.redirect('/cart');
  } catch (err) {
    console.error('Remove cart item error:', err);
    res.redirect('/cart');
  }
});

module.exports = router;
