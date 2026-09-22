const express = require('express');
const router = express.Router();
const CarService = require('../service/CarService');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');

// GET /cars (public) filters: location, vehicleType, fuelType, seats, minPrice, maxPrice, search
router.get('/', asyncHandler(async (req, res) => {
    const cars = await CarService.list(req.query);
    res.status(200).json({ success: true, count: cars.length, cars });
  })
);

// GET /cars/mine (owner) -- must stay above /:id
router.get('/mine', protect, authorize('owner'), asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, cars: await CarService.listByOwner(req.user._id) });
  })
);

// GET /cars/:id (public)
router.get('/:id', asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, car: await CarService.getById(req.params.id) });
  })
);

// POST /cars (owner, multipart with file field "image")
router.post('/', protect, authorize('owner'), upload.single('image'), asyncHandler(async (req, res) => {
    const car = await CarService.create(req.user, req.body, req.file);
    res.status(201).json({ success: true, message: 'Car created', car });
  })
);

// PUT /cars/:id (owner)
router.put('/:id', protect, authorize('owner'), upload.single('image'), asyncHandler(async (req, res) => {
    const car = await CarService.update(req.user, req.params.id, req.body, req.file);
    res.status(200).json({ success: true, message: 'Car updated', car });
  })
);

// DELETE /cars/:id (owner)
router.delete('/:id', protect, authorize('owner'), asyncHandler(async (req, res) => {
    await CarService.remove(req.user, req.params.id);
    res.status(200).json({ success: true, message: 'Car deleted' });
  })
);

module.exports = router;