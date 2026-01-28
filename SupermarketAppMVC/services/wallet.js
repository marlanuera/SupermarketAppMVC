const db = require('../db');

async function ensureWalletRow(userId) {
    const [[row]] = await db.promise().query(
        'SELECT balance, points FROM wallets WHERE user_id = ?',
        [userId]
    );
    if (!row) {
        await db.promise().query(
            'INSERT INTO wallets (user_id, balance, points, updated_at) VALUES (?, 0, 0, NOW())',
            [userId]
        );
        return { balance: 0, points: 0 };
    }
    return row;
}

async function addTransaction(userId, type, method, amount) {
    await db.promise().query(
        `INSERT INTO transactions (user_id, type, method, amount, currency, status, created_at)
         VALUES (?, ?, ?, ?, 'SGD', 'Completed', NOW())`,
        [userId, type, method, amount]
    );
}

async function creditWallet(userId, amount, type = 'Credit', method = 'Wallet') {
    const creditAmount = Number(amount) || 0;
    if (creditAmount <= 0) return;

    await ensureWalletRow(userId);
    await db.promise().query(
        'UPDATE wallets SET balance = balance + ?, updated_at = NOW() WHERE user_id = ?',
        [creditAmount, userId]
    );
    await addTransaction(userId, type, method, creditAmount);
}

module.exports = {
    ensureWalletRow,
    addTransaction,
    creditWallet
};
