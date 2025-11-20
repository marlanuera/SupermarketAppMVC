const OrdersModel = require('../models/Orders');
const CartItemsModel = require('../models/CartItems');
const OrderItemsModel = require('../models/OrderItems');

const OrdersController = {
    checkout: (req, res) => {
        const userId = req.session.user.id;
        CartItemsModel.getCartByUserId(userId, (err, cartItems) => {
            if (err || !cartItems.length) return res.status(400).send('Cart is empty');

            const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

            // create order
            OrdersModel.createOrder(userId, totalAmount, (err, result) => {
                if (err) return res.status(500).send('Could not create order');
                const orderId = result.insertId;

                // add items to OrderItems table
                const addItemsPromises = cartItems.map(item => {
                    return new Promise((resolve, reject) => {
                        OrderItemsModel.addOrderItem(orderId, item.productId, item.quantity, item.price, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                });

                Promise.all(addItemsPromises)
                    .then(() => {
                        CartItemsModel.clearCart(userId, () => {
                            res.redirect(`/orders/${orderId}`);
                        });
                    })
                    .catch(() => res.status(500).send('Could not add order items'));
            });
        });
    },

    viewOrders: (req, res) => {
        const userId = req.session.user.id;
        OrdersModel.getOrdersByUserId(userId, (err, orders) => {
            if (err) return res.status(500).send('Database error');
            res.render('orders', { orders, user: req.session.user });
        });
    },

    viewOrderDetails: (req, res) => {
        const orderId = req.params.id;
        OrderItemsModel.getItemsByOrderId(orderId, (err, items) => {
            if (err) return res.status(500).send('Database error');
            res.render('orderDetails', { items, user: req.session.user });
        });
    }
};

module.exports = OrdersController;
