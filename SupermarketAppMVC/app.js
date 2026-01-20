const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const ProductsController = require('./controllers/ProductsController');
const UsersController = require('./controllers/UsersController');
const db = require('./db');
const app = express();





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
            return res.render('checkout', { cart: [], subtotal: 0, tax: 0, total: 0, user: req.session.user });
        }

        // Calculate totals
        let subtotal = 0;
        cartItems.forEach(item => { subtotal += item.price * item.quantity; });
        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        // Save cart in session for payment
        req.session.cart = cartItems;

        res.render('checkout', { cart: cartItems, subtotal, tax, total, user: req.session.user, paypalClientId: process.env.PAYPAL_CLIENT_ID,
    paypalCurrency: 'SGD' });
    } catch (err) {
        console.error(err);
        res.send('Error loading checkout page');
    }
});


// PayPal routes
const paypalRoutes = require('./routes/paypal');
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
