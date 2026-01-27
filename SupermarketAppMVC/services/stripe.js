// services/stripe.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // put your sk_test in .env

module.exports = {
  createCheckoutSession: async (cartItems, successUrl, cancelUrl) => {
    // Transform cart items into Stripe line items
    const line_items = cartItems.map(item => ({
      price_data: {
        currency: 'sgd',
        product_data: { name: item.productName },
        unit_amount: Math.round(item.price * 100), // convert to cents
      },
      quantity: item.quantity,
    }));

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
