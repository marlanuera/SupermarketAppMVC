const ReviewsModel = require('../models/Reviews');

const ReviewsController = {
    addReview: (req, res) => {
        const userId = req.session.user.id;
        const { productId, rating, comment } = req.body;
        ReviewsModel.addReview(userId, productId, rating, comment, (err) => {
            if (err) return res.status(500).send('Could not add review');
            res.redirect(`/product/${productId}`);
        });
    },

    viewReviews: (req, res) => {
        const productId = req.params.id;
        ReviewsModel.getReviewsByProductId(productId, (err, reviews) => {
            if (err) return res.status(500).send('Database error');
            res.render('productReviews', { reviews, user: req.session.user });
        });
    }
};

module.exports = ReviewsController;
