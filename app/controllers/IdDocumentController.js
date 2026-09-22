const express = require('express');
const router = express.Router();
const IdDocumentService = require('../service/IdDocumentService');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');

// GET /ids/me -> my ID records
router.get('/me', protect, asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, ids: await IdDocumentService.getByUser(req.user._id) });
  })
);

// POST /ids (owner only) -> add another ID, max 2 in total
router.post('/', protect, authorize('owner'), upload.array('idImages', 2), asyncHandler(async (req, res) => {
    const ids = await IdDocumentService.addDocuments(req.user, req.files, req.body.idType);
    res.status(201).json({ success: true, ids });
  })
);

// DELETE /ids/:id (owner only)
router.delete('/:id', protect, authorize('owner'), asyncHandler(async (req, res) => {
    await IdDocumentService.removeDocument(req.user, req.params.id);
    res.status(200).json({ success: true, message: 'ID removed.' });
  })
);

module.exports = router;