  const express = require('express');
  const router = express.Router();
  const BookingService = require('../service/BookingService');
  const { protect, authorize } = require('../middleware/auth');
  const upload = require('../middleware/upload');
  const asyncHandler = require('../utils/asyncHandler');

  const customerOnly = [protect, authorize('customer')];
  const ownerOnly = [protect, authorize('owner')];

  // (multipart: carId, startDate, endDate, idImage -> idImage only needed on the FIRST booking)
  // this route is for customer bookings 
  router.post('/', ...customerOnly, upload.single('idImage'), asyncHandler(async (req, res) => {
      const booking = await BookingService.create(req.user, req.body, req.file);
      res.status(201).json({ success: true, message: 'Rental request submitted', booking });
    })
  );

  // get all customer request booking
  router.get('/mine', ...customerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, bookings: await BookingService.listForCustomer(req.user._id) });
    })
  );

  // this route for cancelling the booking but (only while pending / approved)
  router.patch('/:id/cancel', ...customerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, message: 'Booking cancelled', booking: await BookingService.cancel(req.user, req.params.id) });
    })
  );

  // route for paying the down payment after owner approved. (after owner approval)
  router.post('/:id/pay-downpayment', ...customerOnly, asyncHandler(async (req, res) => {
      const result = await BookingService.payDownPayment(req.user, req.params.id);
      res.status(200).json({ success: true, ...result });
    })
  );

  // route for paying the balance (after owner marked the booking completed)
  router.post('/:id/pay-balance', ...customerOnly, asyncHandler(async (req, res) => {
      const result = await BookingService.payBalance(req.user, req.params.id);
      res.status(200).json({ success: true, ...result });
    })
  );

  // get all booking that is peending
  router.get('/owner', ...ownerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, bookings: await BookingService.listForOwner(req.user._id, req.query.status) });
    })
  );

  // approve the booking request
  router.patch('/:id/approve', ...ownerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, message: 'Booking approved', booking: await BookingService.approve(req.user, req.params.id) });
    })
  );

  // reject the booking request body: { reason }
  router.patch('/:id/reject', ...ownerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, message: 'Booking rejected', booking: await BookingService.reject(req.user, req.params.id, req.body.reason) });
    })
  );

  // PATCH /bookings/:id/pickup
  router.patch('/:id/pickup', ...ownerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, message: 'Rental started', booking: await BookingService.markPickedUp(req.user, req.params.id) });
    })
  );

  // PATCH /bookings/:id/return body: { isGoodCondition, notes }
  router.patch('/:id/return', ...ownerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, message: 'Car returned', booking: await BookingService.markReturned(req.user, req.params.id, req.body) });
    })
  );

  // PATCH /bookings/:id/complete (owner verified the car condition -> customer can pay balance)
  router.patch('/:id/complete', ...ownerOnly, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, message: 'Transaction completed', booking: await BookingService.complete(req.user, req.params.id) });
    })
  );

  // GET /bookings/:id (only the customer or the owner of that booking)
  router.get('/:id', protect, asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, booking: await BookingService.getById(req.user, req.params.id) });
    })
  );

  module.exports = router;