const db = require('../db');

const CartItemsModel = {
    getCartByUserId: (userId, callback) => {
        const sql = `
            SELECT ci.id, ci.productId, ci.quantity, p.productName, p.price, p.image
            FROM cartItems ci
            JOIN products p ON ci.productId = p.id
            WHERE ci.userId = ?`;
        db.query(sql, [userId], callback);
    },

    addCartItem: (userId, productId, quantity, callback) => {
        const sql = 'INSERT INTO cartItems (userId, productId, quantity) VALUES (?, ?, ?)';
        db.query(sql, [userId, productId, quantity], callback);
    },

    updateCartItem: (id, quantity, callback) => {
        const sql = 'UPDATE cartItems SET quantity = ? WHERE id = ?';
        db.query(sql, [quantity, id], callback);
    },

    removeCartItem: (id, callback) => {
        const sql = 'DELETE FROM cartItems WHERE id = ?';
        db.query(sql, [id], callback);
    },

    clearCart: (userId, callback) => {
        const sql = 'DELETE FROM cartItems WHERE userId = ?';
        db.query(sql, [userId], callback);
    }
};

module.exports = CartItemsModel;
