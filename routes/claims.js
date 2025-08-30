const express = require('express');
const router = express.Router();
const Claim = require('../models/Claim');
const BusinessCheckService = require('../services/BusinessCheckService');
const AIService = require('../services/AIService');

const businessCheckService = new BusinessCheckService();
const aiService = new AIService();

// In-memory storage for demo (replace with database in production)
let claims = [];
let claimCounter = 1;

// GET /api/claims/pending - Get pending claims for queue
router.get('/pending', (req, res) => {
  try {
    const pendingClaims = claims
      .filter(claim => claim.status === 'pending')
      .map(claim => ({
        id: claim.id,
        patientName: claim.patientName,
        insurer: claim.insurer,
        submittedAt: claim.submittedAt,
        flagsCount: claim.getQuickFlagsCount(),
        documentCount: claim.pages.length,
        claimSubtype: claim.getClaimSubtype()
      }))
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    res.json({
      success: true,
      data: pendingClaims,
      count: pendingClaims.length
    });
  } catch (error) {
    console.error('Error fetching pending claims:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending claims'
    });
  }
});

// GET /api/claims/:id - Get claim details
router.get('/:id', (req, res) => {
  try {
    const claim = claims.find(c => c.id === req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    res.json({
      success: true,
      data: claim.toJSON()
    });
  } catch (error) {
    console.error('Error fetching claim:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch claim details'
    });
  }
});

// POST /api/claims/:id/review - Review a claim
router.post('/:id/review', (req, res) => {
  try {
    const { decision, note, reviewerId } = req.body;
    
    if (!decision || !['approve', 'reject', 'request_info'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid decision. Must be approve, reject, or request_info'
      });
    }

    const claim = claims.find(c => c.id === req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Claim has already been reviewed'
      });
    }

    // Review the claim
    claim.review(decision, note || '', reviewerId || 'reviewer-001');

    res.json({
      success: true,
      message: `Claim ${decision}d successfully`,
      data: {
        id: claim.id,
        status: claim.status,
        reviewedAt: claim.reviewedAt,
        reviewerNote: claim.reviewerNote
      }
    });
  } catch (error) {
    console.error('Error reviewing claim:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to review claim'
    });
  }
});

// POST /api/claims - Create a new claim
router.post('/', (req, res) => {
  try {
    const { patientName, insurer } = req.body;
    
    if (!patientName || !insurer) {
      return res.status(400).json({
        success: false,
        error: 'Patient name and insurer are required'
      });
    }

    const claim = new Claim({
      patientName,
      insurer,
      submittedAt: new Date().toISOString()
    });

    claims.push(claim);

    res.status(201).json({
      success: true,
      message: 'Claim created successfully',
      data: {
        id: claim.id,
        patientName: claim.patientName,
        insurer: claim.insurer,
        submittedAt: claim.submittedAt,
        status: claim.status
      }
    });
  } catch (error) {
    console.error('Error creating claim:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create claim'
    });
  }
});

// GET /api/claims - Get all claims (for admin purposes)
router.get('/', (req, res) => {
  try {
    const allClaims = claims.map(claim => ({
      id: claim.id,
      patientName: claim.patientName,
      insurer: claim.insurer,
      submittedAt: claim.submittedAt,
      status: claim.status,
      flagsCount: claim.getQuickFlagsCount(),
      documentCount: claim.pages.length,
      claimSubtype: claim.getClaimSubtype()
    }));

    res.json({
      success: true,
      data: allClaims,
      count: allClaims.length
    });
  } catch (error) {
    console.error('Error fetching all claims:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch claims'
    });
  }
});

// DELETE /api/claims/:id - Delete a claim (for cleanup)
router.delete('/:id', (req, res) => {
  try {
    const claimIndex = claims.findIndex(c => c.id === req.params.id);
    
    if (claimIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    claims.splice(claimIndex, 1);

    res.json({
      success: true,
      message: 'Claim deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting claim:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete claim'
    });
  }
});

// POST /api/claims/:id/process - Process uploaded documents for a claim
router.post('/:id/process', async (req, res) => {
  try {
    const claim = claims.find(c => c.id === req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Claim has already been processed'
      });
    }

    // Process each page
    for (const page of claim.pages) {
      if (!page.documentType) {
        const classification = await aiService.classifyPage(page);
        claim.updatePageClassification(page.id, classification);
      }
    }

    // Group pages into documents
    claim.groupPagesIntoDocuments();

    // Extract fields for each document group
    for (const prescriptionGroup of claim.prescriptions) {
      const extractedData = await aiService.extractPrescriptionFields(prescriptionGroup);
      prescriptionGroup.extractedData = extractedData;
    }

    for (const billGroup of claim.bills) {
      const extractedData = await aiService.extractBillFields(billGroup);
      billGroup.extractedData = extractedData;
    }

    // Run business checks
    const businessChecks = await businessCheckService.runBusinessChecks(claim);
    claim.updateBusinessChecks(businessChecks);

    res.json({
      success: true,
      message: 'Claim processed successfully',
      data: {
        id: claim.id,
        pagesProcessed: claim.pages.length,
        prescriptionsFound: claim.prescriptions.length,
        billsFound: claim.bills.length,
        businessChecks: claim.businessChecks
      }
    });
  } catch (error) {
    console.error('Error processing claim:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process claim',
      details: error.message
    });
  }
});

// GET /api/claims/:id/export - Export claim scrutiny report
router.get('/:id/export', (req, res) => {
  try {
    const claim = claims.find(c => c.id === req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    // Generate scrutiny report
    const report = {
      claimId: claim.id,
      patientName: claim.patientName,
      insurer: claim.insurer,
      submittedAt: claim.submittedAt,
      status: claim.status,
      claimSubtype: claim.getClaimSubtype(),
      summary: {
        totalPages: claim.pages.length,
        prescriptions: claim.prescriptions.length,
        bills: claim.bills.length,
        reports: claim.reports.length
      },
      businessChecks: claim.businessChecks,
      documents: {
        prescriptions: claim.prescriptions.map(p => ({
          id: p.id,
          pages: p.pages.length,
          extractedData: p.extractedData
        })),
        bills: claim.bills.map(b => ({
          id: b.id,
          pages: b.pages.length,
          extractedData: b.extractedData
        }))
      },
      review: {
        status: claim.status,
        reviewerNote: claim.reviewerNote,
        reviewedAt: claim.reviewedAt,
        reviewerId: claim.reviewerId
      },
      generatedAt: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="claim-${claim.id}-report.json"`);
    res.json(report);
  } catch (error) {
    console.error('Error exporting claim report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export claim report'
    });
  }
});

module.exports = router; 