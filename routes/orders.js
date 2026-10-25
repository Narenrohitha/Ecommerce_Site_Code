const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isLoggedIn } = require('../middleware/auth');

// Checkout page - shows cart summary + address form
router.get('/checkout', isLoggedIn, async (req, res) => {
  try {
    const [items] = await db.query(
      `SELECT ci.id AS cart_id, ci.quantity, p.id AS product_id, p.name, p.price, p.stock
       FROM cart_items ci JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ?`,
      [req.session.user.id]
    );

    if (items.length === 0) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/cart');
    }

    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
    res.render('checkout', { title: 'Checkout', items, total });
  } catch (err) {
    console.error('Checkout page error:', err);
    res.status(500).send('Server error loading checkout.');
  }
});

// Place order - Cash on Delivery only (no payment gateway)
router.post('/checkout/place-order', isLoggedIn, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { full_name, phone, address, city, postal_code, notes } = req.body;

    if (!full_name || !phone || !address || !city) {
      req.flash('error', 'Please fill in all required shipping fields.');
      return res.redirect('/checkout');
    }

    await connection.beginTransaction();

    const [items] = await connection.query(
      `SELECT ci.quantity, p.id AS product_id, p.name, p.price, p.stock
       FROM cart_items ci JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = ? FOR UPDATE`,
      [req.session.user.id]
    );

    if (items.length === 0) {
      await connection.rollback();
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/cart');
    }

    // Check stock availability
    for (const item of items) {
      if (item.stock < item.quantity) {
        await connection.rollback();
        req.flash('error', `Insufficient stock for "${item.name}". Only ${item.stock} left.`);
        return res.redirect('/cart');
      }
    }

    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id, total_amount, status, payment_method, full_name, phone, address, city, postal_code, notes)
       VALUES (?, ?, 'pending', 'cod', ?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, total, full_name, phone, address, city, postal_code || null, notes || null]
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
        [orderId, item.product_id, item.name, item.price, item.quantity]
      );
      await connection.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    await connection.query('DELETE FROM cart_items WHERE user_id = ?', [req.session.user.id]);

    await connection.commit();

    req.flash('success', 'Order placed successfully! Pay cash on delivery.');
    res.redirect(`/orders/${orderId}`);
  } catch (err) {
    await connection.rollback();
    console.error('Place order error:', err);
    req.flash('error', 'Could not place order. Please try again.');
    res.redirect('/checkout');
  } finally {
    connection.release();
  }
});

// Order history for logged-in user
router.get('/orders', isLoggedIn, async (req, res) => {
  try {
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.user.id]
    );
    res.render('orders', { title: 'My Orders', orders });
  } catch (err) {
    console.error('Orders list error:', err);
    res.status(500).send('Server error loading orders.');
  }
});

// Single order detail
router.get('/orders/:id', isLoggedIn, async (req, res) => {
  try {
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.user.id]
    );
    if (orders.length === 0) {
      return res.status(404).render('404', { title: 'Not Found' });
    }
    const [items] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
    res.render('order-detail', { title: `Order #${req.params.id}`, order: orders[0], items });
  } catch (err) {
    console.error('Order detail error:', err);
    res.status(500).send('Server error loading order.');
  }
});

module.exports = router;
