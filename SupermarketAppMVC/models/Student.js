const db = require('../db');

const StudentModel = {
    // PRODUCTS

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
    },

    // USERS

    getAllUsers: (callback) => {
        const sql = 'SELECT * FROM users';
        db.query(sql, callback);
    },

    getUserById: (id, callback) => {
        const sql = 'SELECT * FROM users WHERE id = ?';
        db.query(sql, [id], callback);
    },

    addUser: (user, callback) => {
        const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, ?, ?, ?, ?)';
        db.query(sql, [user.username, user.email, user.password, user.address, user.contact, user.role], callback);
    },

    updateUser: (id, user, callback) => {
        const sql = 'UPDATE users SET username = ?, email = ?, password = ?, address = ?, contact = ?, role = ? WHERE id = ?';
        db.query(sql, [user.username, user.email, user.password, user.address, user.contact, user.role, id], callback);
    },

    deleteUser: (id, callback) => {
        const sql = 'DELETE FROM users WHERE id = ?';
        db.query(sql, [id], callback);
    }
};

module.exports = StudentModel;