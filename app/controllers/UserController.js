const express = require('express');
const router = express.Router();
const AuthService = require('../service/UserService');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');

// POST /users/register (multipart/form-data)
// Customer: name, email, password, phone
// Owner:    + role=owner, brandName (optional), idType, idImages (1-2 files)
router.post('/register', upload.fields([{ name: 'idImages', maxCount: 2 }]), asyncHandler(async (req, res) => {
    const data = await AuthService.register(req.body, req.files);
    res.status(201).json({ success: true, message: 'User registered successfully', ...data });
  })
);

router.post('/login', asyncHandler(async (req, res) => {
    const data = await AuthService.login(req.body);
    res.status(200).json({ success: true, message: 'Login successful', ...data });
  })
);

router.get('/info', protect, asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, user: req.user });
  })
);

module.exports = router;