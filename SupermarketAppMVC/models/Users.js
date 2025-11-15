const db = require('../db');

const UsersModel = {
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

module.exports = UsersModel;
