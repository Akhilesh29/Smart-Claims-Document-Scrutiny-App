const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const Claim = require('../models/Claim');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 20 // Maximum 20 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Allow PDF and image files
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/bmp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Only PDF and image files are supported.`));
    }
  }
});

// In-memory storage for demo (replace with database in production)
let claims = [];

// POST /api/upload/claim - Upload documents for a new claim
router.post('/claim', upload.array('documents', 20), async (req, res) => {
  try {
    const { patientName, insurer } = req.body;
    
    if (!patientName || !insurer) {
      return res.status(400).json({
        success: false,
        error: 'Patient name and insurer are required'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No documents uploaded'
      });
    }

    // Create new claim
    const claim = new Claim({
      patientName,
      insurer,
      submittedAt: new Date().toISOString()
    });

    // Add uploaded files as pages
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const pageData = {
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        pageNumber: i + 1
      };
      
      claim.addPage(pageData);
    }

    // Add claim to storage
    claims.push(claim);

    res.status(201).json({
      success: true,
      message: 'Claim created with documents successfully',
      data: {
        claimId: claim.id,
        patientName: claim.patientName,
        insurer: claim.insurer,
        documentsUploaded: req.files.length,
        submittedAt: claim.submittedAt,
        status: claim.status
      }
    });
  } catch (error) {
    console.error('Error creating claim with documents:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create claim with documents',
      details: error.message
    });
  }
});

// POST /api/upload/documents/:claimId - Add more documents to existing claim
router.post('/documents/:claimId', upload.array('documents', 20), async (req, res) => {
  try {
    const { claimId } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No documents uploaded'
      });
    }

    // Find existing claim
    const claim = claims.find(c => c.id === claimId);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Cannot add documents to already processed claim'
      });
    }

    // Add new documents as pages
    const startPageNumber = claim.pages.length + 1;
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const pageData = {
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        pageNumber: startPageNumber + i
      };
      
      claim.addPage(pageData);
    }

    res.json({
      success: true,
      message: 'Documents added to claim successfully',
      data: {
        claimId: claim.id,
        newDocumentsAdded: req.files.length,
        totalDocuments: claim.pages.length,
        updatedAt: claim.updatedAt
      }
    });
  } catch (error) {
    console.error('Error adding documents to claim:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add documents to claim',
      details: error.message
    });
  }
});

// DELETE /api/upload/document/:claimId/:pageId - Remove a document from claim
router.delete('/document/:claimId/:pageId', async (req, res) => {
  try {
    const { claimId, pageId } = req.params;
    
    // Find claim
    const claim = claims.find(c => c.id === claimId);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify documents on already processed claim'
      });
    }

    // Find page
    const pageIndex = claim.pages.findIndex(p => p.id === pageId);
    
    if (pageIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    const page = claim.pages[pageIndex];
    
    // Delete file from disk
    try {
      await fs.unlink(page.path);
    } catch (unlinkError) {
      console.error('Error deleting file:', unlinkError);
    }

    // Remove page from claim
    claim.pages.splice(pageIndex, 1);
    
    // Reorder remaining pages
    claim.pages.forEach((p, index) => {
      p.pageNumber = index + 1;
    });

    claim.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: 'Document removed from claim successfully',
      data: {
        claimId: claim.id,
        pageId: pageId,
        remainingDocuments: claim.pages.length,
        updatedAt: claim.updatedAt
      }
    });
  } catch (error) {
    console.error('Error removing document from claim:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove document from claim',
      details: error.message
    });
  }
});

// GET /api/upload/claim/:claimId/documents - Get all documents for a claim
router.get('/claim/:claimId/documents', (req, res) => {
  try {
    const { claimId } = req.params;
    
    // Find claim
    const claim = claims.find(c => c.id === claimId);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    const documents = claim.pages.map(page => ({
      id: page.id,
      pageNumber: page.pageNumber,
      filename: page.filename,
      originalName: page.originalName,
      mimetype: page.mimetype,
      size: page.size,
      documentType: page.documentType,
      confidence: page.confidence,
      uploadedAt: page.createdAt
    }));

    res.json({
      success: true,
      data: {
        claimId: claim.id,
        patientName: claim.patientName,
        documents: documents,
        totalCount: documents.length
      }
    });
  } catch (error) {
    console.error('Error fetching claim documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch claim documents',
      details: error.message
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum is 20 files per upload.'
      });
    }
  }
  
  if (error.message.includes('File type')) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  
  console.error('Upload error:', error);
  res.status(500).json({
    success: false,
    error: 'File upload failed',
    details: error.message
  });
});

module.exports = router; 