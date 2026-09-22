const express = require('express');
const router = express.Router();
const CarService = require('../service/CarService');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');

const ownerOnly = [protect, authorize('owner')];
const adminOnly = [protect, authorize('admin')];

// A car listing takes two images: the car photo and its Certificate of Registration (CR),
// which proves this specific car belongs to the owner uploading it.
const carFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'registrationImage', maxCount: 1 },
]);

//  Public 

// GET /cars  only approved + available listings. filters: location, vehicleType, fuelType, seats, minPrice, maxPrice, search
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cars = await CarService.list(req.query);
    res.status(200).json({ success: true, count: cars.length, cars });
  })
);

//  Owner (must stay above /:id) 

// GET /cars/mine  -- every car the owner listed, any status, so they can see pending/rejected/suspended + adminNote
router.get(
  '/mine',
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, cars: await CarService.listByOwner(req.user._id) });
  })
);

//  Admin (must stay above /:id) 

// GET /cars/admin/pending -- listings waiting for review
router.get(
  '/admin/pending',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, cars: await CarService.listForAdmin('pending') });
  })
);

// GET /cars/admin -- every listing, optional ?status= filter
router.get(
  '/admin',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, cars: await CarService.listForAdmin(req.query.status) });
  })
);

//  Public (:id must come after the fixed paths above) 

// GET /cars/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, car: await CarService.getById(req.params.id) });
  })
);

//  Owner: manage a listing 

// POST /cars  multipart, file fields "image" and "registrationImage". Starts out "pending" until an admin approves it.
router.post(
  '/',
  ...ownerOnly,
  carFiles,
  asyncHandler(async (req, res) => {
    const car = await CarService.create(req.user, req.body, req.files);
    res.status(201).json({ success: true, message: 'Car submitted for admin review', car });
  })
);

// PUT /cars/:id  multipart, both files optional. Editing a rejected listing sends it back to "pending".
router.put(
  '/:id',
  ...ownerOnly,
  carFiles,
  asyncHandler(async (req, res) => {
    const car = await CarService.update(req.user, req.params.id, req.body, req.files);
    res.status(200).json({ success: true, message: 'Car updated', car });
  })
);

// DELETE /cars/:id
router.delete(
  '/:id',
  ...ownerOnly,
  asyncHandler(async (req, res) => {
    await CarService.remove(req.user, req.params.id);
    res.status(200).json({ success: true, message: 'Car deleted' });
  })
);

//  Admin: review a listing 

// PATCH /cars/:id/approve -- makes the listing public and bookable
router.patch(
  '/:id/approve',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, message: 'Car approved', car: await CarService.approve(req.params.id) });
  })
);

// PATCH /cars/:id/reject  body: { reason }
router.patch(
  '/:id/reject',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, message: 'Car rejected', car: await CarService.reject(req.params.id, req.body.reason) });
  })
);

// PATCH /cars/:id/suspend  body: { reason } -- pauses an approved listing, no new requests can come in
router.patch(
  '/:id/suspend',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, message: 'Car suspended', car: await CarService.suspend(req.params.id, req.body.reason) });
  })
);

// PATCH /cars/:id/reinstate -- lifts a suspension, back to approved
router.patch(
  '/:id/reinstate',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, message: 'Car reinstated', car: await CarService.reinstate(req.params.id) });
  })
);

module.exports = router;