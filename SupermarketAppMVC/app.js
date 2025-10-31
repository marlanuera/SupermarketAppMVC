const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const StudentController = require('./controllers/StudentController');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
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
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;
    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Home page
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Inventory (admin only)
app.get('/inventory', checkAuthenticated, checkAdmin, StudentController.listProductsView);

// Shopping (user)
app.get('/shopping', checkAuthenticated, StudentController.listProductsViewShopping);

// Product details
app.get('/product/:id', checkAuthenticated, StudentController.getProductByIdView);

// Add product (admin only)
app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addProduct', { user: req.session.user });
});
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), StudentController.addProductView);

// Update product (admin only)
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, StudentController.getProductByIdEditView);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), StudentController.updateProductView);

app.post('/deleteProduct/:id', checkAuthenticated, checkAdmin, StudentController.deleteProductView);

// Cart
app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

// Add to cart
app.post('/add-to-cart/:id', checkAuthenticated, StudentController.addToCart);

// Register
app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});
app.post('/register', validateRegistration, StudentController.registerUser);

// Login
app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});
app.post('/login', StudentController.loginUser);

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
