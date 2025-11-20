const CartItemsModel = require('../models/CartItems');

const CartItemsController = {
    viewCart: (req, res) => {
        const userId = req.session.user.id;
        CartItemsModel.getCartByUserId(userId, (err, cartItems) => {
            if (err) return res.status(500).send('Database error');
            res.render('cart', { cartItems, user: req.session.user });
        });
    },

    addToCart: (req, res) => {
        const userId = req.session.user.id;
        const { productId, quantity } = req.body;
        CartItemsModel.addCartItem(userId, productId, quantity, (err) => {
            if (err) return res.status(500).send('Could not add to cart');
            res.redirect('/shopping');
        });
    },

    removeFromCart: (req, res) => {
        CartItemsModel.removeCartItem(req.params.id, (err) => {
            if (err) return res.status(500).send('Could not remove from cart');
            res.redirect('/cart');
        });
    },

    clearCart: (req, res) => {
        const userId = req.session.user.id;
        CartItemsModel.clearCart(userId, (err) => {
            if (err) return res.status(500).send('Could not clear cart');
            res.redirect('/cart');
        });
    }
};

module.exports = CartItemsController;
