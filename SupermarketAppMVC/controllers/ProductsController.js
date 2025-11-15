const ProductsModel = require('../models/Products');

const ProductsController = {

    listProductsView: (req, res) => {
        ProductsModel.getAllProducts((err, products) => {
            if (err) return res.status(500).send('Database error');
            res.render('inventory', { products, user: req.session.user });
        });
    },

    listProductsViewShopping: (req, res) => {
        ProductsModel.getAllProducts((err, products) => {
            if (err) return res.status(500).send('Database error');
            res.render('shopping', { products, user: req.session.user });
        });
    },

    getProductByIdView: (req, res) => {
        ProductsModel.getProductById(req.params.id, (err, results) => {
            if (err) return res.status(500).send('Database error');
            if (!results.length) return res.status(404).send('Product not found');
            res.render('product', { product: results[0], user: req.session.user });
        });
    },

    getProductByIdEditView: (req, res) => {
        ProductsModel.getProductById(req.params.id, (err, results) => {
            if (err) return res.status(500).send('Database error');
            if (!results.length) return res.status(404).send('Product not found');
            res.render('editProduct', { product: results[0], user: req.session.user });
        });
    },

    addProductView: (req, res) => {
        const product = req.body;
        if (req.file) product.image = req.file.filename;

        ProductsModel.addProduct(product, (err) => {
            if (err) return res.status(500).send('Database error');
            res.redirect('/inventory');
        });
    },

    updateProductView: (req, res) => {
        const id = req.params.id;
        const product = req.body;
        if (req.file) product.image = req.file.filename;

        ProductsModel.updateProduct(id, product, (err) => {
            if (err) return res.status(500).send('Database error');
            res.redirect('/inventory');
        });
    },

    deleteProductView: (req, res) => {
        ProductsModel.deleteProduct(req.params.id, (err) => {
            if (err) {
                req.flash('error', 'Database error');
                return res.redirect('/inventory');
            }
            res.redirect('/inventory');
        });
    },

    addToCart: (req, res) => {
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity) || 1;

        ProductsModel.getProductById(productId, (err, results) => {
            if (err || !results.length) {
                req.flash('error', 'Product not found');
                return res.redirect('/shopping');
            }

            const product = results[0];
            if (!req.session.cart) req.session.cart = [];

            const existing = req.session.cart.find(item => item.id === product.id);

            if (existing) {
                existing.quantity = quantity;
            } else {
                req.session.cart.push({ ...product, quantity });
            }

            res.redirect('/cart');
        });
    }
};

module.exports = ProductsController;
