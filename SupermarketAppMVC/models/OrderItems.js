const db = require('../db');

const OrderItemsModel = {
    addOrderItem: (orderId, productId, quantity, price, callback) => {
        const sql = 'INSERT INTO OrderItems (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)';
        db.query(sql, [orderId, productId, quantity, price], callback);
    },

    getItemsByOrderId: (orderId, callback) => {
        const sql = `
            SELECT oi.*, p.productName, p.image
            FROM OrderItems oi
            JOIN products p ON oi.productId = p.id
            WHERE oi.orderId = ?`;
        db.query(sql, [orderId], callback);
    }
};

module.exports = OrderItemsModel;
