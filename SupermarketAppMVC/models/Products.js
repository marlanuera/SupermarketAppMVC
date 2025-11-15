const db = require('../db');

const ProductsModel = {
    getAllProducts: (callback) => {
        const sql = 'SELECT * FROM products';
        db.query(sql, callback);
    },

    getProductById: (id, callback) => {
        const sql = 'SELECT * FROM products WHERE id = ?';
        db.query(sql, [id], callback);
    },

    addProduct: (product, callback) => {
        const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
        db.query(sql, [product.productName, product.quantity, product.price, product.image], callback);
    },

    updateProduct: (id, product, callback) => {
        const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
        db.query(sql, [product.productName, product.quantity, product.price, product.image, id], callback);
    },

    deleteProduct: (id, callback) => {
        const sql = 'DELETE FROM products WHERE id = ?';
        db.query(sql, [id], callback);
    }
};

module.exports = ProductsModel;
