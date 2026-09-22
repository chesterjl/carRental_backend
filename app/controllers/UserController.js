const express = require('express');
const router = express.Router();
const UserService = require('../service/UserService');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');

// POST /users/register (multipart/form-data)
// Customer: name, email, password, phone
// Owner:    + role=owner, brandName (optional), idType, idImages (1-2 files)
router.post('/register', upload.fields([{ name: 'idImages', maxCount: 2 }]), asyncHandler(async (req, res) => {
    const data = await UserService.register(req.body, req.files);
    res.status(201).json({ success: true, message: 'User registered successfully', ...data });
  })
);

router.post('/login', asyncHandler(async (req, res) => {
    const data = await UserService.login(req.body);
    res.status(200).json({ success: true, message: 'Login successful', ...data });
  })
);

router.get('/info', protect, asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, user: req.user });
  })
);

// PATCH /users/info body: any of { name, phone, email, password, brandName } (brandName: owners only)
router.patch('/info', protect, asyncHandler(async (req, res) => {
    const user = await UserService.updateInfo(req.user, req.body);
    res.status(200).json({ success: true, message: 'Profile updated', user });
  })
);

// POST /users/admin/bootstrap (public, but only works ONCE -- fails as soon as any admin exists)
// Use this to create the very first admin on a fresh deployment. Body: name, email, password, phone.
router.post('/admin/bootstrap', asyncHandler(async (req, res) => {
    const data = await UserService.bootstrapFirstAdmin(req.body);
    res.status(201).json({ success: true, message: 'First admin account created', ...data });
  })
);

// POST /users/admin (admin only) -- an existing admin creates another admin account.
router.post('/admin', protect, authorize('admin'), asyncHandler(async (req, res) => {
    const data = await UserService.createAdmin(req.body);
    res.status(201).json({ success: true, message: 'Admin account created', ...data });
  })
);

module.exports = router;