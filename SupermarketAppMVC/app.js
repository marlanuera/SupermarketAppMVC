const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const ProductsController = require('./controllers/ProductsController');
const UsersController = require('./controllers/UsersController');
const db = require('./db'); // Make sure this is your promise-based db
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images'),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

// Set up view engine
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

// Session Middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/shopping');
};

// Middleware for registration validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;
    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// --- Routes --- //

// Home page
app.get('/', (req, res) => res.render('index', { user: req.session.user }));

// Inventory (admin)
app.get('/inventory', checkAuthenticated, checkAdmin, ProductsController.listProductsView);

// Shopping
app.get('/shopping', checkAuthenticated, async (req, res) => {
    const [products] = await db.promise().query('SELECT * FROM products');
    res.render('shopping', {
        products,
        messages: req.flash()
    });
});

// Product details
app.get('/product/:id', checkAuthenticated, ProductsController.getProductByIdView);

// Add product (admin)
app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => res.render('addProduct', { user: req.session.user }));
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.addProductView);

// Update product (admin)
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductsController.getProductByIdEditView);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.updateProductView);

// Delete product (admin)
app.post('/deleteProduct/:id', checkAuthenticated, checkAdmin, ProductsController.deleteProductView);

// --- Cart Routes using cartitems table ---

// View Cart
app.get('/cart', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [cart] = await db.promise().query(`
            SELECT ci.id AS cartId, ci.quantity, p.id AS productId, p.productName, p.price, p.category, p.image
            FROM cartitems ci
            JOIN products p ON ci.productId = p.id
            WHERE ci.userId = ?
        `, [userId]);
        res.render('cart', { cart, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.send('Error fetching cart');
    }
});

// Add to Cart
app.post('/add-to-cart/:id', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const productId = parseInt(req.params.id);
        let quantity = parseInt(req.body.quantity);
        if (!quantity || quantity < 1) quantity = 1;

        const [productRows] = await db.promise().query(
            'SELECT quantity, productName FROM products WHERE id = ?',
            [productId]
        );

        if (!productRows.length) {
            req.flash('error', 'Product not found');
            return res.redirect('/shopping');
        }

        const stock = productRows[0].quantity;
        if (quantity > stock) {
            req.flash('error', `Insufficient stock for "${productRows[0].productName}". Only ${stock} available.`);
            return res.redirect('/shopping');
        }

        const [cartRows] = await db.promise().query(
            'SELECT * FROM cartitems WHERE userId = ? AND productId = ?',
            [userId, productId]
        );

        if (cartRows.length > 0) {
            const newQuantity = cartRows[0].quantity + quantity;
            if (newQuantity > stock) {
                req.flash('error', `Cannot add ${quantity} items. Only ${stock - cartRows[0].quantity} more can be added.`);
                return res.redirect('/shopping');
            }
            await db.promise().query(
                'UPDATE cartitems SET quantity = quantity + ? WHERE userId = ? AND productId = ?',
                [quantity, userId, productId]
            );
        } else {
            await db.promise().query(
                'INSERT INTO cartitems (userId, productId, quantity) VALUES (?, ?, ?)',
                [userId, productId, quantity]
            );
        }

        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error adding product to cart');
        res.redirect('/shopping');
    }
});



// Update Cart Quantity
app.post('/update-cart/:id', checkAuthenticated, async (req, res) => {
    const cartId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity);
    if (quantity < 1) return res.redirect('/cart');

    try {
        await db.promise().query('UPDATE cartitems SET quantity = ? WHERE id = ?', [quantity, cartId]);
        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.send('Error updating cart');
    }
});

// Remove from Cart
app.post('/remove-from-cart/:id', checkAuthenticated, async (req, res) => {
    const cartId = parseInt(req.params.id);
    try {
        await db.promise().query('DELETE FROM cartitems WHERE id = ?', [cartId]);
        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.send('Error removing item');
    }
});

// Clear Cart
app.post('/cart/clear', checkAuthenticated, async (req, res) => {
    try {
        await db.promise().query('DELETE FROM cartitems WHERE userId = ?', [req.session.user.id]);
        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.send('Error clearing cart');
    }
});


// Checkout page
app.get('/checkout', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [cartItems] = await db.promise().query(`
            SELECT c.id AS cartId, c.quantity, p.id AS productId, p.productName, p.category, p.price, p.image
            FROM cartitems c
            JOIN products p ON c.productId = p.id
            WHERE c.userId = ?
        `, [userId]);

        if (!cartItems || cartItems.length === 0) {
            return res.render('checkout', { cart: [], subtotal: 0, tax: 0, total: 0, user: req.session.user });
        }

        let subtotal = 0;
        cartItems.forEach(item => { subtotal += item.price * item.quantity; });
        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        // Save cart in session for payment
        req.session.cart = cartItems;

        res.render('checkout', { cart: cartItems, subtotal, tax, total, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.send('Error loading checkout page');
    }
});


// Process checkout
app.post('/checkout', checkAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [cartResult] = await db.promise().query(`
      SELECT c.quantity, p.id AS productId, p.price
      FROM cartitems c
      JOIN products p ON c.productId = p.id
      WHERE c.userId = ?
    `, [userId]);

    const cartItems = cartResult;
    if (!cartItems.length) return res.redirect('/cart');

    // Calculate total
    let subtotal = 0;
    cartItems.forEach(item => { subtotal += item.price * item.quantity; });
    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    // Create order
    const [orderResult] = await db.promise().query(
      `INSERT INTO orders (userId, orderDate, totalAmount, status) VALUES (?, NOW(), ?, 'pending')`,
      [userId, total]
    );
    const orderId = orderResult.insertId;

    // Add order items and deduct stock
    for (const item of cartItems) {
      await db.promise().query(
        `INSERT INTO orderitems (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)`,
        [orderId, item.productId, item.quantity, item.price]
      );

      // Deduct stock from products table
      await db.promise().query(
        `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
        [item.quantity, item.productId]
      );
    }

    // Clear cart
    await db.promise().query(`DELETE FROM cartitems WHERE userId = ?`, [userId]);

    res.render('orderSuccess', { orderId, total, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.send('Error processing your order');
  }
});



app.get('/payment', checkAuthenticated, (req, res) => {
  const cart = req.session.cart || [];

  if (!cart || cart.length === 0) {
    return res.redirect('/cart'); // redirect if cart is empty
  }

  let subtotal = 0;
  cart.forEach(item => subtotal += item.price * item.quantity);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  res.render('payment', { cart, subtotal, tax, total, user: req.session.user });
});

app.post('/payment', checkAuthenticated, async (req, res) => {
  const cart = req.session.cart || [];
  if (!cart.length) return res.redirect('/cart');

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  // Create order
  try {
    const [orderResult] = await db.promise().query(
      `INSERT INTO orders (userId, orderDate, totalAmount, status) VALUES (?, NOW(), ?, 'pending')`,
      [req.session.user.id, total]
    );

    const orderId = orderResult.insertId;

    for (const item of cart) {
      await db.promise().query(
        `INSERT INTO orderitems (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)`,
        [orderId, item.productId, item.quantity, item.price]
      );
    }

    // Clear cart
    await db.promise().query(`DELETE FROM cartitems WHERE userId = ?`, [req.session.user.id]);
    req.session.cart = [];

    res.render('ordersuccess', { orderId, total, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.send('Error processing payment');
  }
});



// --- Reviews Routes --- //
app.get('/reviews', checkAuthenticated, async (req, res) => {
    try {
        const [reviews] = await db.promise().query(`
            SELECT r.id, r.rating, r.comment, r.createdAt, r.userId, u.username, p.productName
            FROM reviews r
            JOIN users u ON r.userId = u.id
            JOIN products p ON r.productId = p.id
            ORDER BY r.createdAt DESC
        `);

        const [products] = await db.promise().query(`SELECT id, productName FROM products`);
        res.render('reviews', { reviews, products, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.send('Error fetching reviews');
    }
});

app.post('/reviews/add', checkAuthenticated, async (req, res) => {
    const { productId, rating, comment } = req.body;
    try {
        await db.promise().query(
            `INSERT INTO reviews (userId, productId, rating, comment) VALUES (?, ?, ?, ?)`,
            [req.session.user.id, productId, rating, comment]
        );
        res.redirect('/reviews');
    } catch (err) {
        console.error(err);
        res.send('Error adding review');
    }
});

app.get('/admin/reviews', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const [reviews] = await db.promise().query(`
            SELECT r.id, r.rating, r.comment, r.createdAt, r.userId, u.username, p.productName
            FROM reviews r
            JOIN users u ON r.userId = u.id
            JOIN products p ON r.productId = p.id
            ORDER BY r.createdAt DESC
        `);
        res.render('adminReviews', { reviews, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.send('Error fetching reviews');
    }
});

app.post('/reviews/delete/:id', checkAuthenticated, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`SELECT * FROM reviews WHERE id = ?`, [req.params.id]);
        if (!rows.length) return res.redirect('/reviews');

        const review = rows[0];
        if (req.session.user.role !== 'admin' && req.session.user.id !== review.userId) {
            req.flash('error', 'You are not allowed to delete this review');
            return res.redirect('/reviews');
        }

        await db.promise().query(`DELETE FROM reviews WHERE id = ?`, [req.params.id]);
        if (req.session.user.role === 'admin') res.redirect('/admin/reviews');
        else res.redirect('/reviews');
    } catch (err) {
        console.error(err);
        res.send('Error deleting review');
    }
});

// Admin: View all orders
app.get('/admin/orders', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const [orders] = await db.promise().query(`
            SELECT o.id AS orderId, o.userId, o.orderDate, o.totalAmount, o.status, u.username, u.email
            FROM orders o
            JOIN users u ON o.userId = u.id
            ORDER BY o.orderDate DESC
        `);

        // Get order items for each order
        for (let order of orders) {
            const [items] = await db.promise().query(`
                SELECT oi.productId, oi.quantity, oi.price, p.productName
                FROM orderitems oi
                JOIN products p ON oi.productId = p.id
                WHERE oi.orderId = ?
            `, [order.orderId]);
            order.items = items;
        }

        res.render('adminOrders', { orders, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.send('Error fetching orders');
    }
});

// Admin: Update order status
app.post('/admin/orders/:id/status', checkAuthenticated, checkAdmin, async (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body; // 'pending', 'shipped', 'completed'
    try {
        await db.promise().query(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId]);
        res.redirect('/admin/orders');
    } catch (err) {
        console.error(err);
        res.send('Error updating order status');
    }
});

// --- Auth Routes --- //
app.get('/register', (req, res) => res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] }));
app.post('/register', validateRegistration, UsersController.registerUser);

app.get('/login', (req, res) => res.render('login', { messages: req.flash('success'), errors: req.flash('error') }));
app.post('/login', UsersController.loginUser);

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
