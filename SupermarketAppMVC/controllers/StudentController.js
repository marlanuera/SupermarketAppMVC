const StudentModel = require('../models/Student');

const StudentController = {
    // Render inventory for admin
    listProductsView: (req, res) => {
        StudentModel.getAllProducts((err, products) => {
            if (err) return res.status(500).send('Database error');
            res.render('inventory', { products, user: req.session.user });
        });
    },

    // Render shopping for user
    listProductsViewShopping: (req, res) => {
        StudentModel.getAllProducts((err, products) => {
            if (err) return res.status(500).send('Database error');
            res.render('shopping', { products, user: req.session.user });
        });
    },

    // Render product details
    getProductByIdView: (req, res) => {
        StudentModel.getProductById(req.params.id, (err, results) => {
            if (err) return res.status(500).send('Database error');
            if (!results.length) return res.status(404).send('Product not found');
            res.render('product', { product: results[0], user: req.session.user });
        });
    },

    // Render edit product page
    getProductByIdEditView: (req, res) => {
        StudentModel.getProductById(req.params.id, (err, results) => {
            if (err) return res.status(500).send('Database error');
            if (!results.length) return res.status(404).send('Product not found');
            res.render('editProduct', { product: results[0], user: req.session.user });
        });
    },

    // Handle add product POST
    addProductView: (req, res) => {
        const product = req.body;
        if (req.file) product.image = req.file.filename;
        StudentModel.addProduct(product, (err, result) => {
            if (err) return res.status(500).send('Database error');
            res.redirect('/inventory');
        });
    },

    // Handle update product POST
    updateProductView: (req, res) => {
        const id = req.params.id;
        const product = req.body;
        if (req.file) product.image = req.file.filename;
        StudentModel.updateProduct(id, product, (err, result) => {
            if (err) return res.status(500).send('Database error');
            res.redirect('/inventory');
        });
    },

    // Handle delete product POST
    deleteProductView: (req, res) => {
        const id = req.params.id;
        StudentModel.deleteProduct(id, (err, result) => {
            if (err) {
                req.flash('error', 'Database error');
                return res.redirect('/inventory');
            }
            res.redirect('/inventory');
        });
    },

    // Placeholder for add to cart
    addToCart: (req, res) => {
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity) || 1;
        StudentModel.getProductById(productId, (err, results) => {
            if (err || !results.length) {
                req.flash('error', 'Product not found');
                return res.redirect('/shopping');
            }
            const product = results[0];
            if (!req.session.cart) req.session.cart = [];
            // Check if product already in cart
            const existing = req.session.cart.find(item => item.id === product.id);
            if (existing) {
                existing.quantity = quantity; // <-- Set, don't add
            } else {
                req.session.cart.push({ ...product, quantity });
            }
            res.redirect('/cart');
        });
    },

    // Placeholder for registration
    registerUser: (req, res) => {
        const user = req.body;
        StudentModel.addUser(user, (err, result) => {
            if (err) {
                req.flash('error', 'Registration failed');
                req.flash('formData', req.body);
                return res.redirect('/register');
            }
            req.flash('success', 'Registration successful! Please log in.');
            res.redirect('/login');
        });
    },

    // Placeholder for login
    loginUser: (req, res) => {
        const { email, password } = req.body;
        console.log('Login attempt:', email, password);
        StudentModel.getAllUsers((err, users) => {
            if (err) {
                req.flash('error', 'Database error');
                return res.redirect('/login');
            }
            console.log('Users in DB:', users);
            const user = users.find(u => u.email === email && u.password === password);
            if (user) {
                req.session.user = user;
                if (user.role === 'admin') {
                    res.redirect('/inventory');
                } else {
                    res.redirect('/shopping');
                }
            } else {
                req.flash('error', 'Invalid credentials');
                res.redirect('/login');
            }
        });
    }
};

module.exports = StudentController;