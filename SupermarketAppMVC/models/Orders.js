const db = require('../db');

const OrdersModel = {
    createOrder: (userId, totalAmount, callback) => {
        const sql = 'INSERT INTO Orders (userId, totalAmount) VALUES (?, ?)';
        db.query(sql, [userId, totalAmount], callback);
    },

    getOrdersByUserId: (userId, callback) => {
        const sql = 'SELECT * FROM Orders WHERE userId = ? ORDER BY orderDate DESC';
        db.query(sql, [userId], callback);
    },

    getOrderById: (orderId, callback) => {
        const sql = 'SELECT * FROM Orders WHERE id = ?';
        db.query(sql, [orderId], callback);
    },

    updateOrderStatus: (orderId, status, callback) => {
        const sql = 'UPDATE Orders SET status = ? WHERE id = ?';
        db.query(sql, [status, orderId], callback);
    }
};

module.exports = OrdersModel;
