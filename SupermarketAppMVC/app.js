const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const ProductsController = require('./controllers/ProductsController');
const UsersController = require('./controllers/UsersController');
const db = require('./db');
const app = express();
const fetch = require('node-fetch'); // at the top of app.js if not already imported
const axios = require('axios');
const netsQr = require('./services/nets');
const stripeService = require('./services/stripe');
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

async function getPayPalAccessToken() {
    const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: "Basic " + Buffer.from(PAYPAL_CLIENT + ":" + PAYPAL_SECRET).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });
    const data = await res.json();
    return data.access_token;
}

async function ensureWalletRow(userId) {
    const [[row]] = await db.promise().query(
        'SELECT balance, points FROM wallets WHERE user_id = ?',
        [userId]
    );
    if (!row) {
        await db.promise().query(
            'INSERT INTO wallets (user_id, balance, points) VALUES (?, 0, 0)',
            [userId]
        );
        return { balance: 0, points: 0 };
    }
    return row;
}



/* -------------------- MULTER SETUP -------------------- */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });


/* -------------------- APP SETTINGS -------------------- */
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json()); 
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

/* -------------------- MIDDLEWARE -------------------- */
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in first');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/shopping');
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        req.flash('error', 'All fields are required');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    if (password.length < 6) {
        req.flash('error', 'Password must be at least 6 characters');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

/* -------------------- HOME -------------------- */
app.get('/', (req, res) => {
  const user = req.session.user || null; // or wherever your logged-in user info is
  res.render('index', { user });
});



/* -------------------- INVENTORY (ADMIN) -------------------- */
app.get('/inventory', checkAuthenticated, checkAdmin, ProductsController.listProductsView);

// Admin: Customer Accounts
app.get('/admin/customers', checkAuthenticated, checkAdmin, UsersController.listCustomers);
app.post('/admin/customers/:id/delete', checkAuthenticated, checkAdmin, UsersController.deleteCustomer);

// Profile view
app.get('/profile', checkAuthenticated, UsersController.profileView);
// Update profile
app.post('/profile', checkAuthenticated, UsersController.updateProfile);


/* -------------------- SHOPPING PAGE -------------------- */
app.get('/shopping', checkAuthenticated, async (req, res) => {
    const [products] = await db.promise().query('SELECT * FROM products');
    res.render('shopping', { 
        products, 
        messages: req.flash(),
        user: req.session.user  // <-- add this
    });
});


/* -------------------- PRODUCT DETAILS -------------------- */
app.get('/product/:id', checkAuthenticated, ProductsController.getProductByIdView);

/* -------------------- PRODUCT CRUD (ADMIN) -------------------- */
app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addProduct', { user: req.session.user });
});
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.addProductView);

app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductsController.getProductByIdEditView);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.updateProductView);

app.post('/deleteProduct/:id', checkAuthenticated, checkAdmin, ProductsController.deleteProductView);

/* -------------------- CART ROUTES -------------------- */

// View Cart
app.get('/cart', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [cart] = await db.promise().query(`
            SELECT ci.id AS cartId, ci.quantity, p.id AS productId,
            p.productName, p.price, p.category, p.image, p.quantity AS stock
            FROM cartitems ci
            JOIN products p ON ci.productId = p.id
            WHERE ci.userId = ?
        `, [userId]);

        res.render('cart', { cart, user: req.session.user, messages: req.flash() });
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
        let quantity = parseInt(req.body.quantity) || 1;

        const [[product]] = await db.promise().query(
            'SELECT quantity, productName FROM products WHERE id = ?',
            [productId]
        );

        if (!product) {
            req.flash('error', 'Product not found');
            return res.redirect('/shopping');
        }

        if (quantity > product.quantity) {
            req.flash('error', `Only ${product.quantity} left in stock`);
            return res.redirect('/shopping');
        }

        const [existing] = await db.promise().query(
            'SELECT * FROM cartitems WHERE userId = ? AND productId = ?',
            [userId, productId]
        );

        if (existing.length > 0) {
            const newQty = existing[0].quantity + quantity;
            if (newQty > product.quantity) {
                req.flash('error', `Cannot exceed stock of ${product.quantity}`);
                return res.redirect('/shopping');
            }

            await db.promise().query(
                'UPDATE cartitems SET quantity = ? WHERE id = ?',
                [newQty, existing[0].id]
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
        req.flash('error', 'Error adding to cart');
        res.redirect('/shopping');
    }
});

// Update Cart
app.post('/update-cart/:id', checkAuthenticated, async (req, res) => {
    try {
        const cartId = parseInt(req.params.id);
        const newQty = parseInt(req.body.quantity);

        if (newQty < 1) return res.redirect('/cart');

        const [[item]] = await db.promise().query(`
            SELECT ci.*, p.quantity AS stock
            FROM cartitems ci
            JOIN products p ON ci.productId = p.id
            WHERE ci.id = ?
        `, [cartId]);

        if (newQty > item.stock) {
            req.flash('error', `Only ${item.stock} in stock`);
            return res.redirect('/cart');
        }

        await db.promise().query('UPDATE cartitems SET quantity = ? WHERE id = ?', [newQty, cartId]);
        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.send('Error updating cart');
    }
});

// Remove Item
app.post('/remove-from-cart/:id', checkAuthenticated, async (req, res) => {
    try {
        await db.promise().query('DELETE FROM cartitems WHERE id = ?', [parseInt(req.params.id)]);
        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.send('Error removing item');
    }
});

// Clear Cart
app.post('/cart/clear', checkAuthenticated, async (req, res) => {
    await db.promise().query('DELETE FROM cartitems WHERE userId = ?', [req.session.user.id]);
    res.redirect('/cart');
});

/* -------------------- CHECKOUT -------------------- */

// Checkout page
app.get('/checkout', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [cartItems] = await db.promise().query(`
            SELECT c.id AS cartId, c.quantity, p.id AS productId, p.productName, p.category, p.price, p.image, p.quantity AS stock
            FROM cartitems c
            JOIN products p ON c.productId = p.id
            WHERE c.userId = ?
        `, [userId]);

        if (!cartItems || cartItems.length === 0) {
            return res.render('checkout', { 
                cart: [], 
                subtotal: 0, 
                tax: 0, 
                total: 0, 
                payableTotal: 0,
                walletBalance: 0,
                walletApplied: 0,
                pointsAvailable: 0,
                pointsToRedeem: 0,
                pointsDiscount: 0,
                maxPointsRedeemable: 0,
                user: req.session.user 
            });
        }

        const walletRow = await ensureWalletRow(userId);
        const walletBalance = Number(walletRow.balance) || 0;
        const pointsAvailable = Number(walletRow.points) || 0;

        // Calculate totals
        let subtotal = 0;
        cartItems.forEach(item => { subtotal += item.price * item.quantity; });
        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        const walletUseRaw = Number(req.session.walletUseAmount || 0);
        const walletApplied = Math.max(0, Math.min(walletUseRaw || 0, walletBalance, total));
        const remainingAfterWallet = Math.max(0, total - walletApplied);

        const pointsToRedeemRaw = parseInt(req.session.pointsToRedeem || 0);
        const pointsToRedeemUnrounded = Math.max(0, Math.min(pointsToRedeemRaw || 0, pointsAvailable));
        const pointsToRedeem = Math.floor(pointsToRedeemUnrounded / 10) * 10;
        const pointsValue = pointsToRedeem * 0.10; // 10 points = $1
        const pointsDiscount = Math.min(pointsValue, remainingAfterWallet);
        const payableTotal = Math.max(0, remainingAfterWallet - pointsDiscount);
        const maxPointsByTotal = Math.floor(remainingAfterWallet / 0.10);
        const maxPointsRedeemable = Math.floor(Math.min(pointsAvailable, maxPointsByTotal) / 10) * 10;

        req.session.walletUseAmount = walletApplied;
        req.session.pointsToRedeem = pointsToRedeem;
        req.session.pointsDiscount = pointsDiscount;
        req.session.payableTotal = payableTotal;

        // Save cart in session for payment
        req.session.cart = cartItems;

        res.render('checkout', { 
            cart: cartItems, 
            subtotal, 
            tax, 
            total, 
            payableTotal,
            walletBalance,
            walletApplied,
            pointsAvailable,
            pointsToRedeem,
            pointsDiscount,
            maxPointsRedeemable,
            walletError: req.query.walletError === '1',
            user: req.session.user, 
            paypalClientId: process.env.PAYPAL_CLIENT_ID,
            paypalCurrency: 'SGD'
        });
    } catch (err) {
        console.error(err);
        res.send('Error loading checkout page');
    }
});

app.post('/checkout/apply-rewards', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const pointsRequested = parseInt(req.body.pointsToRedeem || 0);
        const walletRequested = Number(req.body.walletUseAmount || 0);

        const walletRow = await ensureWalletRow(userId);
        const pointsAvailable = Number(walletRow.points) || 0;
        const walletBalance = Number(walletRow.balance) || 0;
        const pointsRaw = isNaN(pointsRequested) ? 0 : Math.max(0, Math.min(pointsRequested, pointsAvailable));
        const pointsToRedeem = Math.floor(pointsRaw / 10) * 10;
        const walletUseAmount = isNaN(walletRequested) ? 0 : Math.max(0, Math.min(walletRequested, walletBalance));

        req.session.pointsToRedeem = pointsToRedeem;
        req.session.walletUseAmount = walletUseAmount;
        res.redirect('/checkout');
    } catch (err) {
        console.error('Error applying points:', err);
        res.redirect('/checkout');
    }
});

app.post('/checkout/pay-wallet', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const cart = req.session.cart || [];
        if (!cart.length) return res.redirect('/checkout');

        let subtotal = 0;
        cart.forEach(item => subtotal += item.price * item.quantity);
        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        const pointsDiscount = Number(req.session.pointsDiscount || 0);
        const orderTotal = Math.max(0, total - pointsDiscount);

        const walletRow = await ensureWalletRow(userId);
        const walletBalance = Number(walletRow.balance) || 0;

        if (walletBalance < orderTotal) {
            return res.redirect('/checkout?walletError=1');
        }

        req.session.walletUseAmount = orderTotal;
        req.session.payableTotal = 0;

        res.redirect('/payment-success?method=wallet');
    } catch (err) {
        console.error('Wallet checkout error:', err);
        res.redirect('/checkout');
    }
});

app.post('/checkout/complete-wallet', checkAuthenticated, (req, res) => {
    const payableTotal = Number(req.session.payableTotal || 0);
    if (payableTotal > 0) return res.redirect('/checkout');
    res.redirect('/payment-success?method=wallet');
});


// PayPal routes
const paypalRoutes = require('./services/paypal');
app.use('/paypal', paypalRoutes);



/* -------------------- ORDER HISTORY -------------------- */

// GET /order-history - show user's past orders
app.get('/order-history', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Fetch all orders of this user
        const [orders] = await db.promise().query(`
            SELECT id AS orderId, totalAmount, orderDate, status
            FROM orders
            WHERE userId = ?
            ORDER BY orderDate DESC
        `, [userId]);

        // Fetch items for each order
        for (let order of orders) {
            const [items] = await db.promise().query(`
                SELECT oi.productId, oi.quantity, oi.price, p.productName
                FROM orderitems oi
                JOIN products p ON oi.productId = p.id
                WHERE oi.orderId = ?
            `, [order.orderId]);

            order.items = items;
        }

        res.render('orderHistory', { orders, user: req.session.user });

    } catch (err) {
        console.error(err);
        res.send('Error fetching order history');
    }
});


app.get('/order-invoice/:id', checkAuthenticated, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user.id;

        const [[order]] = await db.promise().query(
            'SELECT * FROM orders WHERE id = ? AND userId = ?',
            [orderId, userId]
        );
        if (!order) return res.send('Order not found');

        const [items] = await db.promise().query(`
            SELECT oi.productId, oi.quantity, oi.price, p.productName
            FROM orderitems oi
            JOIN products p ON oi.productId = p.id
            WHERE oi.orderId = ?
        `, [orderId]);

        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        res.render('orderInvoice', { order, items, subtotal, tax, total });
    } catch (err) {
        console.error(err);
        res.send('Error loading invoice');
    }
});


/* -------------------- PAYMENT -------------------- */

// GET payment page
app.get('/payment', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    if (!cart.length) return res.redirect('/checkout');

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    res.render('payment', { cart, subtotal, tax, total, user: req.session.user });
});


// POST /payment - process payment
app.post('/payment', checkAuthenticated, async (req, res) => {
    try {
        const cart = req.session.cart || [];
        if (!cart.length) return res.redirect('/checkout');

        const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        const userId = req.session.user.id;

        // 1️⃣ Insert order into orders table (auto-increment ID)
        const [orderResult] = await db.promise().query(
            'INSERT INTO orders (userId, totalAmount, orderDate, status) VALUES (?, ?, NOW(), ?)',
            [userId, total, 'Completed']
        );

        // 2️⃣ Get the newly created orderId
        const orderId = orderResult.insertId;

        // 3️⃣ Insert each cart item into orderitems
        for (let item of cart) {
            await db.promise().query(
                'INSERT INTO orderitems (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, item.productId, item.quantity, item.price]
            );

            // 4️⃣ Update stock
            await db.promise().query(
                'UPDATE products SET quantity = quantity - ? WHERE id = ?',
                [item.quantity, item.productId]
            );
        }

        // 5️⃣ Clear user's cart in DB and session
        await db.promise().query('DELETE FROM cartitems WHERE userId = ?', [userId]);
        req.session.cart = [];

        // 6️⃣ Render order success page
        res.render('orderSuccess', { cart, subtotal, tax, total, orderId, user: req.session.user });

    } catch (err) {
        console.error('Payment error:', err);
        res.send('Payment processing failed');
    }
});


/* -------------------- REVIEWS -------------------- */

app.get('/reviews', checkAuthenticated, async (req, res) => {
    try {
        const [reviews] = await db.promise().query(`
            SELECT r.id, r.rating, r.comment, r.createdAt, r.userId,
                   u.username, p.productName
            FROM reviews r
            JOIN users u ON r.userId = u.id
            JOIN products p ON r.productId = p.id
            ORDER BY r.createdAt DESC
        `);

        const [products] = await db.promise().query('SELECT id, productName FROM products');

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
            `INSERT INTO reviews (userId, productId, rating, comment)
             VALUES (?, ?, ?, ?)`,
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
            SELECT r.id, r.rating, r.comment, r.createdAt, u.username, p.productName
            FROM reviews r
            JOIN users u ON r.userId = u.id
            JOIN products p ON r.productId = p.id
            ORDER BY r.createdAt DESC
        `);

        res.render('adminReviews', { reviews, user: req.session.user });

    } catch (err) {
        console.error(err);
        res.send('Error loading admin reviews');
    }
});

app.post('/reviews/delete/:id', checkAuthenticated, async (req, res) => {
    try {
        const [[review]] = await db.promise().query(
            'SELECT * FROM reviews WHERE id = ?', [req.params.id]
        );

        if (!review) return res.redirect('/reviews');

        if (req.session.user.role !== 'admin' && req.session.user.id !== review.userId) {
            req.flash('error', 'You cannot delete this review');
            return res.redirect('/reviews');
        }

        await db.promise().query(
            'DELETE FROM reviews WHERE id = ?', [req.params.id]
        );

        if (req.session.user.role === 'admin') return res.redirect('/admin/reviews');
        res.redirect('/reviews');

    } catch (err) {
        console.error(err);
        res.send('Error deleting review');
    }
});

/* -------------------- ADMIN: ORDERS -------------------- */

app.get('/admin/orders', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const [orders] = await db.promise().query(`
            SELECT o.id AS orderId, o.userId, o.orderDate,
                   o.totalAmount, o.status, u.username, u.email
            FROM orders o
            JOIN users u ON o.userId = u.id
            ORDER BY o.orderDate DESC
        `);

        // fetch items per order
        for (let order of orders) {
            const [items] = await db.promise().query(`
                SELECT oi.productId, oi.quantity, oi.price,
                       p.productName
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

app.post('/admin/orders/:id/status', checkAuthenticated, checkAdmin, async (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;

    try {
        await db.promise().query(
            'UPDATE orders SET status = ? WHERE id = ?',
            [status, orderId]
        );

        res.redirect('/admin/orders');

    } catch (err) {
        console.error(err);
        res.send('Error updating order');
    }
});


app.post('/paypal/capture-order', async (req, res) => {
  const { orderId } = req.body;

  try {
    // capture payment using PayPal API
    const captureData = await capturePayPalOrder(orderId); // your PayPal capture logic
    if (!captureData) return res.status(400).json({ ok: false, error: "Capture failed" });

    // Save order to database
    const newOrder = await Order.create({
      items: req.session.cart,
      subtotal: req.session.subtotal,
      tax: req.session.tax,
      total: req.session.total,
      user: req.session.userId,        // if you have a logged-in user
      status: 'Pending',               // initial status
      paymentId: orderId,              // store PayPal order ID
      shippingInfo: req.body.shipping  // optional
    });

    // SAVE this order ID in session so /receipt knows
    req.session.lastOrderId = newOrder._id;

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/generateNETSQR', checkAuthenticated, netsQr.generateQrCode);


app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const txnRetrievalRef = req.params.txnRetrievalRef;
  let pollCount = 0;
  const maxPolls = 60; // 5 minutes

  const interval = setInterval(async () => {
    pollCount++;

    try {
      const response = await axios.post(
        'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
        {
          txn_retrieval_ref: txnRetrievalRef,
          frontend_timeout_status: 0
        },
        {
          headers: {
            'api-key': process.env.NETS_API_KEY,
            'project-id': process.env.PROJECT_ID,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data?.result?.data;
      res.write(`data: ${JSON.stringify(response.data)}\n\n`);

      if (data?.response_code === "00" && data?.txn_status === 1) {
        res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
        clearInterval(interval);
        return res.end();
      }

    } catch (err) {
      res.write(`data: ${JSON.stringify({ fail: true })}\n\n`);
      clearInterval(interval);
      return res.end();
    }

    if (pollCount >= maxPolls) {
      res.write(`data: ${JSON.stringify({ fail: true, timeout: true })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 5000);

  req.on('close', () => clearInterval(interval));
});

app.get('/nets-qr/success', checkAuthenticated, (req, res) => {
  res.render('netstxnsuccessstatus', {
    user: req.session.user
  });
});

app.get('/nets-qr/fail', checkAuthenticated, (req, res) => {
  res.render('netstxnfailstatus', {
    user: req.session.user
  });
});


app.post('/stripe/create-checkout-session', checkAuthenticated, async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (!cart.length) return res.status(400).json({ error: 'Cart empty' });

    const payableTotal = Number(req.session.payableTotal || 0);
    const session = await stripeService.createCheckoutSession(
      cart,
      'http://localhost:3000/payment-success', // success URL
      'http://localhost:3000/checkout', // cancel URL
      payableTotal
    );

    res.json({ id: session.id });
  } catch (err) {
    console.error('Stripe session error:', err);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

app.get('/payment-success', checkAuthenticated, async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (!cart.length) return res.redirect('/shopping');

    const userId = req.session.user.id;

    let subtotal = 0;
    cart.forEach(item => subtotal += item.price * item.quantity);
    const tax = subtotal * 0.08;
    const total = subtotal + tax;
    const pointsToRedeem = Number(req.session.pointsToRedeem || 0);
    const pointsDiscount = Number(req.session.pointsDiscount || 0);
    const walletUseRequested = Number(req.session.walletUseAmount || 0);
    const orderTotal = Math.max(0, total - pointsDiscount);
    const payableTotal = Math.max(0, orderTotal - walletUseRequested);

    // 1️⃣ Create order
    const [orderResult] = await db.promise().query(
      'INSERT INTO orders (userId, totalAmount, orderDate, status) VALUES (?, ?, NOW(), ?)',
      [userId, orderTotal, 'Completed']
    );

    const orderId = orderResult.insertId;

    // 2️⃣ Insert order items
    for (let item of cart) {
      await db.promise().query(
        'INSERT INTO orderitems (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.productId, item.quantity, item.price]
      );

      await db.promise().query(
        'UPDATE products SET quantity = quantity - ? WHERE id = ?',
        [item.quantity, item.productId]
      );
    }

    // 3️⃣ Clear cart
    await db.promise().query('DELETE FROM cartitems WHERE userId = ?', [userId]);
    req.session.cart = [];

    // 3.5️⃣ Update points (earn + redeem)
    const walletRow = await ensureWalletRow(userId);
    const pointsAvailable = Number(walletRow.points) || 0;
    const walletBalance = Number(walletRow.balance) || 0;
    const walletUsed = Math.max(0, Math.min(walletUseRequested, walletBalance, orderTotal));
    const pointsToUse = Math.max(0, Math.min(pointsToRedeem, pointsAvailable));
    const pointsEarned = Math.floor(orderTotal); // $1 spent = 1 point
    const newPoints = Math.max(0, pointsAvailable - pointsToUse + pointsEarned);

    await db.promise().query(
      'UPDATE wallets SET balance = balance - ?, points = ? WHERE user_id = ?',
      [walletUsed, newPoints, userId]
    );

    if (walletUsed > 0) {
      await db.promise().query(
        `INSERT INTO transactions (user_id, type, method, amount, currency, status, created_at)
         VALUES (?, 'Payment', 'Wallet', ?, 'SGD', 'Completed', NOW())`,
        [userId, walletUsed]
      );
    }

    if (pointsToUse > 0) {
      const pointsValue = pointsToUse * 0.10;
      await db.promise().query(
        `INSERT INTO transactions (user_id, type, method, amount, currency, status, created_at)
         VALUES (?, 'Redeem', 'Points', ?, 'SGD', 'Completed', NOW())`,
        [userId, pointsValue]
      );
    }

    req.session.pointsToRedeem = 0;
    req.session.pointsDiscount = 0;
    req.session.walletUseAmount = 0;
    req.session.payableTotal = 0;

    // 4️⃣ Redirect to receipt with orderId
    res.redirect(`/receipt/${orderId}`);

  } catch (err) {
    console.error(err);
    res.redirect('/shopping');
  }
});


/* -------------------- WALLET -------------------- */

app.get('/wallet', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Get wallet balance and points
        const walletRow = await ensureWalletRow(userId);
        const walletBalance = walletRow ? Number(walletRow.balance) : 0;
        const points = walletRow ? Number(walletRow.points) : 0;

        // Get transactions
        const [txRows] = await db.promise().query(
            'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        const transactions = txRows.map(tx => ({
            ...tx,
            amount: Number(tx.amount) || 0,
            created_at: tx.created_at ? new Date(tx.created_at) : null
        }));

        res.render('wallet', { 
            walletBalance, 
            points, 
            transactions, 
            user: req.session.user,
            paypalClientId: process.env.PAYPAL_CLIENT_ID,
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });

    } catch (err) {
        console.error('Error loading wallet:', err);
        res.send('Error loading wallet');
    }
});

// -------------- Wallet Top-Up via PayPal --------------
app.post('/wallet/topup/paypal', checkAuthenticated, async (req, res) => {
    try {
        const amount = parseFloat(req.body.amount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const accessToken = await getPayPalAccessToken();
        const order = {
            intent: "CAPTURE",
            purchase_units: [{
                amount: {
                    currency_code: "SGD",
                    value: amount.toFixed(2)
                },
                description: "Wallet Top-Up"
            }]
        };

        const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(order)
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(500).json({ error: 'Failed to create PayPal order', details: data });
        }
        res.json({ id: data.id });
    } catch (err) {
        console.error('PayPal top-up create error:', err);
        res.status(500).json({ error: 'Failed to create PayPal order' });
    }
});

app.post('/wallet/topup/paypal/capture', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

        const accessToken = await getPayPalAccessToken();
        const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(500).json({ ok: false, error: 'Payment capture failed', details: data });
        }

        const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
        const amount = capture ? Number(capture.amount.value) : NaN;
        if (isNaN(amount) || amount <= 0) {
            return res.status(500).json({ ok: false, error: 'Invalid captured amount' });
        }

        await ensureWalletRow(userId);
        await db.promise().query(
            'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
            [amount, userId]
        );

        await db.promise().query(
            `INSERT INTO transactions (user_id, type, method, amount, currency, status, created_at)
             VALUES (?, 'Top-Up', 'PayPal', ?, 'SGD', 'Completed', NOW())`,
            [userId, amount]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('PayPal top-up capture error:', err);
        res.status(500).json({ ok: false, error: 'Payment capture failed' });
    }
});

app.post('/wallet/add/paypal', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const amount = parseFloat(req.body.amount);

        if (isNaN(amount) || amount <= 0) return res.send('Invalid amount');

        await ensureWalletRow(userId);
        // Update wallet balance
        await db.promise().query(
            'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
            [amount, userId]
        );

        // Record transaction
        await db.promise().query(
            `INSERT INTO transactions (user_id, type, method, amount, currency, status, created_at)
             VALUES (?, 'Top-Up', 'PayPal', ?, 'SGD', 'Completed', NOW())`,
            [userId, amount]
        );

        res.redirect('/wallet');

    } catch (err) {
        console.error('Error top-up via PayPal:', err);
        res.send('Error processing top-up');
    }
});

// -------------- Wallet Top-Up via Stripe --------------
app.post('/wallet/add/stripe', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const amount = parseFloat(req.body.amount);

        if (isNaN(amount) || amount <= 0) return res.send('Invalid amount');

        await ensureWalletRow(userId);
        // Create Stripe checkout session
        const session = await stripeService.createCheckoutSession(
            [{ productName: 'Wallet Top-Up', price: amount, quantity: 1 }],
            `http://localhost:3000/wallet/stripe-success?amount=${amount}`,
            'http://localhost:3000/wallet'
        );

        res.json({ id: session.id });

    } catch (err) {
        console.error('Stripe top-up error:', err);
        res.status(500).json({ error: 'Failed to create Stripe session' });
    }
});

// -------------- Stripe success redirect --------------
app.get('/wallet/stripe-success', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const amount = parseFloat(req.query.amount);

        if (isNaN(amount) || amount <= 0) return res.send('Invalid amount');

        await ensureWalletRow(userId);
        // Update wallet balance
        await db.promise().query(
            'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
            [amount, userId]
        );

        // Record transaction
        await db.promise().query(
            `INSERT INTO transactions (user_id, type, method, amount, currency, status, created_at)
             VALUES (?, 'Top-Up', 'Stripe', ?, 'SGD', 'Completed', NOW())`,
            [userId, amount]
        );

        res.redirect('/wallet');
    } catch (err) {
        console.error('Stripe success handling error:', err);
        res.send('Error processing Stripe payment');
    }
});

// -------------- Redeem Points --------------
app.post('/wallet/redeem', checkAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const pointsToRedeem = parseInt(req.body.pointsToRedeem);

        if (isNaN(pointsToRedeem) || pointsToRedeem <= 0) return res.send('Invalid points');

        await ensureWalletRow(userId);
        // Get current points
        const [[wallet]] = await db.promise().query(
            'SELECT points, balance FROM wallets WHERE user_id = ?',
            [userId]
        );

        const redeemablePoints = Math.floor(pointsToRedeem / 10) * 10;
        if (redeemablePoints < 10) return res.send('Minimum redeem is 10 points');
        if (!wallet || wallet.points < redeemablePoints) return res.send('Not enough points');

        // 10 points = $1.00
        const value = redeemablePoints * 0.10;

        // Update wallet and deduct points
        await db.promise().query(
            'UPDATE wallets SET balance = balance + ?, points = points - ? WHERE user_id = ?',
            [value, redeemablePoints, userId]
        );

        // Record transaction
        await db.promise().query(
            `INSERT INTO transactions (user_id, type, method, amount, currency, status, created_at)
             VALUES (?, 'Redeem', 'Points', ?, 'SGD', 'Completed', NOW())`,
            [userId, value]
        );

        res.redirect('/wallet');

    } catch (err) {
        console.error('Error redeeming points:', err);
        res.send('Error redeeming points');
    }
});




// Route to render receipt after PayPal payment
app.get('/receipt/:id', checkAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user.id;

    const [[order]] = await db.promise().query(
      'SELECT * FROM orders WHERE id = ? AND userId = ?',
      [orderId, userId]
    );

    if (!order) return res.redirect('/shopping');

    const [items] = await db.promise().query(`
      SELECT oi.quantity, oi.price, p.productName, p.image
      FROM orderitems oi
      JOIN products p ON oi.productId = p.id
      WHERE oi.orderId = ?
    `, [orderId]);

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const tax = subtotal * 0.08;
    const total = subtotal + tax;
    res.render('receipt', {
      order,
      items,
      subtotal,
      tax,
      total,
      user: req.session.user
    });


  } catch (err) {
    console.error(err);
    res.redirect('/shopping');
  }
});




/* -------------------- AUTH -------------------- */

app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

app.post('/register', validateRegistration, UsersController.registerUser);

app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', UsersController.loginUser);

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

/* -------------------- START SERVER -------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
