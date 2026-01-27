// services/stripe.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // put your sk_test in .env

module.exports = {
  createCheckoutSession: async (cartItems, successUrl, cancelUrl, amountOverride) => {
    let line_items;

    if (amountOverride && amountOverride > 0) {
      line_items = [{
        price_data: {
          currency: 'sgd',
          product_data: { name: 'Order Total' },
          unit_amount: Math.round(amountOverride * 100),
        },
        quantity: 1,
      }];
    } else {
      // Transform cart items into Stripe line items
      line_items = cartItems.map(item => ({
        price_data: {
          currency: 'sgd',
          product_data: { name: item.productName },
          unit_amount: Math.round(item.price * 100), // convert to cents
        },
        quantity: item.quantity,
      }));
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return session;
  }
};
