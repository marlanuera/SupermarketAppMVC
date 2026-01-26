const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = "https://api-m.sandbox.paypal.com"; // sandbox for now

// get access token
async function getAccessToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(PAYPAL_CLIENT + ":" + PAYPAL_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await res.json();
  return data.access_token;
}

// create order
router.post('/create-order', async (req, res) => {
  const { items, subtotal, tax, total, shippingName } = req.body;

  try {
    const accessToken = await getAccessToken();

    const order = {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "SGD",
          value: total.toFixed(2),
          breakdown: {
            item_total: { currency_code: "SGD", value: subtotal.toFixed(2) },
            tax_total: { currency_code: "SGD", value: tax.toFixed(2) }
          }
        },
        items: items.map(i => ({
          name: i.productName,
          unit_amount: { currency_code: "SGD", value: i.price.toFixed(2) },
          quantity: i.quantity
        }))
      }]
    };

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(order)
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create PayPal order" });
  }
});

// capture order
router.post('/capture-order', async (req, res) => {
  const { orderId } = req.body;

  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Payment capture failed" });
  }
});

module.exports = router;
