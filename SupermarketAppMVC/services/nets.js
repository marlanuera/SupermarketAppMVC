const axios = require("axios");

/**
 * Generate NETS QR Code (Sandbox)
 * POST /generateNETSQR
 */
exports.generateQrCode = async (req, res) => {
  const { cartTotal } = req.body;

  // Validate cart total
  if (!cartTotal || Number(cartTotal) <= 0) {
    console.error("Invalid cart total for NETS QR:", cartTotal);
    return res.redirect("/nets-qr/fail");
  }

  try {
    const requestBody = {
      // Required sandbox txn_id (can be static or dynamic)
      txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b",
      amt_in_dollars: Number(cartTotal).toFixed(2),
      notify_mobile: 0
    };

    // Use .env variables
    const response = await axios.post(
      `${process.env.NETS_API_URL}/api/v1/common/payments/nets-qr/request`,
      requestBody,
      {
        headers: {
          "api-key": process.env.NETS_API_KEY,
          "project-id": process.env.PROJECT_ID,
          "Content-Type": "application/json"
        }
      }
    );

    const qrData = response?.data?.result?.data;
    console.log("NETS QR response:", qrData);

    // Check if QR generation succeeded
    if (
      qrData &&
      qrData.response_code === "00" &&
      qrData.txn_status === 1 &&
      qrData.qr_code &&
      qrData.txn_retrieval_ref
    ) {
      const context = req.session.netPaymentContext || "checkout";
      const backUrl = context === "paylater" ? "/sunnyside-paylater" : "/checkout";
      const backLabel = context === "paylater" ? "Back to PayLater" : "Back to Checkout";
      return res.render("netsqr", {
        title: "Scan to Pay",
        total: cartTotal,
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef: qrData.txn_retrieval_ref,
        apiKey: process.env.NETS_API_KEY,
        projectId: process.env.PROJECT_ID,
        backUrl,
        backLabel,
        user: req.session.user
      });
    }

    // QR generation failed
    console.error("NETS QR generation failed:", qrData);
    return res.redirect("/nets-qr/fail");

  } catch (error) {
    // Log detailed error for debugging
    console.error("NETS generateQrCode error:", error.response?.data || error.message);
    return res.redirect("/nets-qr/fail");
  }
};


