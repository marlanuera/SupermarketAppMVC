const OrderItemsModel = require('../models/OrderItems');

const OrderItemsController = {

    // View all items in a specific order
    viewItemsByOrder: (req, res) => {
        const orderId = req.params.orderId;
        OrderItemsModel.getItemsByOrderId(orderId, (err, items) => {
            if (err) return res.status(500).send('Database error');
            res.render('orderDetails', { items, user: req.session.user });
        });
    },

    // Admin can update quantity of an order item
    updateQuantity: (req, res) => {
        const { id, quantity } = req.body;
        OrderItemsModel.updateOrderItemQuantity(id, quantity, (err) => {
            if (err) return res.status(500).send('Could not update order item');
            res.redirect('back'); // redirect to previous page
        });
    },

    // Admin can remove an order item
    removeItem: (req, res) => {
        const id = req.params.id;
        OrderItemsModel.removeOrderItem(id, (err) => {
            if (err) return res.status(500).send('Could not remove order item');
            res.redirect('back');
        });
    }

};

module.exports = OrderItemsController;
