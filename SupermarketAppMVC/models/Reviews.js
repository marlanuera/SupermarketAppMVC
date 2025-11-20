const db = require('../db');

const ReviewsModel = {
    addReview: (userId, productId, rating, comment, callback) => {
        const sql = 'INSERT INTO Reviews (userId, productId, rating, comment) VALUES (?, ?, ?, ?)';
        db.query(sql, [userId, productId, rating, comment], callback);
    },

    getReviewsByProductId: (productId, callback) => {
        const sql = `
            SELECT r.*, u.username
            FROM Reviews r
            JOIN users u ON r.userId = u.id
            WHERE r.productId = ?
            ORDER BY r.createdAt DESC`;
        db.query(sql, [productId], callback);
    }
};

module.exports = ReviewsModel;
