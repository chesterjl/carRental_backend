// XENDIT WEBHOOK  -- DISABLED FOR NOW
// Payments are auto-approved in PaymentService.pay().
// To enable real Xendit payments:
//   1. Uncomment everything in this file
//   2. Uncomment the PaymentRoutes lines in server.js
//   3. Follow the "XENDIT INTEGRATION" comments in PaymentService.js and BookingService.js
//   4. In the Xendit dashboard set the invoice callback URL to:
//        https://<your-backend-url>/payments/xendit/webhook

const express = require('express');
const router = express.Router();
// const PaymentService = require('../service/PaymentService');
// const asyncHandler = require('../utils/asyncHandler');

// POST /payments/xendit/webhook  (called by Xendit, no JWT; secured by x-callback-token header)
// router.post(
//   '/xendit/webhook',
//   asyncHandler(async (req, res) => {
//     await PaymentService.handleWebhook(req.headers['x-callback-token'], req.body);
//     res.status(200).json({ received: true });
//   })
// );

module.exports = router;