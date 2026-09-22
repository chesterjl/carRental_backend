// const axios = require('axios'); // XENDIT INTEGRATION: uncomment
const Booking = require('../models/Booking');
const ApiError = require('../utils/ApiError');
const { BOOKING_STATUS } = require('../config/constants');

// type: 'down' | 'balance'
const getPart = (booking, type) => (type === 'down' ? booking.downPayment : booking.balancePayment);

// Shared by the temporary auto-pay AND the Xendit webhook:
// marks a payment as paid and moves the booking status forward.
const markPaid = async (booking, type) => {
  const payment = getPart(booking, type);
  if (payment.status === 'paid') return booking; // already paid / duplicate callback

  payment.status = 'paid';
  payment.paidAt = new Date();

  // Downpayment paid -> Rental Confirmation
  if (type === 'down' && booking.status === BOOKING_STATUS.APPROVED) booking.status = BOOKING_STATUS.CONFIRMED;

  await booking.save();
  return booking;
};

// ============================================================================
// TEMPORARY: auto-pay (no payment gateway).
// Used while the frontend is not ready for the Xendit checkout redirect.
// ============================================================================
const pay = async (booking, customer, type) => {
  await markPaid(booking, type);
  return {
    message: type === 'down' ? 'Downpayment paid (auto-approved). Rental confirmed.' : 'Balance paid (auto-approved).',
    amount: getPart(booking, type).amount,
    booking,
  };
};

// ============================================================================
// XENDIT INTEGRATION -- uncomment when frontend + backend are ready.
//
// How it will work:
//   1. Owner approves the customer (status = "approved")
//   2. Customer clicks "Pay downpayment"
//        -> BookingService.payDownPayment calls createInvoice()
//        -> backend returns { invoiceUrl }, frontend redirects the customer there
//   3. Customer pays on Xendit's page
//   4. Xendit calls POST /payments/xendit/webhook -> handleWebhook()
//        -> markPaid() sets downPayment paid and status "confirmed"
//   The same flow is used for the balance (type = 'balance').
//
// Steps: uncomment `axios` at the top, this whole block, the exports below,
// PaymentController.js, the PaymentRoutes lines in server.js, and swap the
// PaymentService.pay(...) calls in BookingService.js for createInvoice(...).
// ============================================================================

// const createInvoice = async (booking, customer, type) => {
//   const payment = getPart(booking, type);
//
//   // Reuse a still-pending invoice instead of creating duplicates
//   if (payment.status === 'pending' && payment.invoiceUrl) {
//     return { invoiceUrl: payment.invoiceUrl, amount: payment.amount };
//   }
//
//   try {
//     const { data } = await axios.post(
//       'https://api.xendit.co/v2/invoices',
//       {
//         external_id: `booking-${booking._id}-${type}-${Date.now()}`,
//         amount: payment.amount,
//         currency: process.env.XENDIT_CURRENCY || 'PHP',
//         payer_email: customer.email,
//         description: `CarRent ${type === 'down' ? 'downpayment' : 'balance'} for booking ${booking._id}`,
//         success_redirect_url: `${process.env.FRONTEND_URL}/bookings/${booking._id}?payment=success`,
//         failure_redirect_url: `${process.env.FRONTEND_URL}/bookings/${booking._id}?payment=failed`,
//       },
//       { auth: { username: process.env.XENDIT_SECRET_KEY, password: '' } }
//     );
//
//     payment.invoiceId = data.id;
//     payment.invoiceUrl = data.invoice_url;
//     payment.status = 'pending';
//     await booking.save();
//     return { invoiceUrl: data.invoice_url, amount: payment.amount };
//   } catch (err) {
//     if (err.isAxiosError) throw new ApiError(502, `Xendit error: ${err.response?.data?.message || err.message}`);
//     throw err;
//   }
// };
//
// // Called by Xendit's invoice callback (webhook)
// const handleWebhook = async (callbackToken, payload) => {
//   if (!callbackToken || callbackToken !== process.env.XENDIT_CALLBACK_TOKEN) throw new ApiError(401, 'Invalid callback token.');
//
//   const { id, status } = payload;
//   const booking = await Booking.findOne({ $or: [{ 'downPayment.invoiceId': id }, { 'balancePayment.invoiceId': id }] });
//   if (!booking) return; // unknown invoice, ignore
//
//   const type = booking.downPayment.invoiceId === id ? 'down' : 'balance';
//
//   if (status === 'PAID' || status === 'SETTLED') {
//     await markPaid(booking, type);
//   } else if (status === 'EXPIRED') {
//     getPart(booking, type).status = 'expired';
//     await booking.save();
//   }
// };

module.exports = {
  pay,
  // createInvoice,   // XENDIT INTEGRATION: uncomment
  // handleWebhook,   // XENDIT INTEGRATION: uncomment
};