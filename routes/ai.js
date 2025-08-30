const express = require('express');
const router = express.Router();
const AIService = require('../services/AIService');
const BusinessCheckService = require('../services/BusinessCheckService');
const Claim = require('../models/Claim');

const aiService = new AIService();
const businessCheckService = new BusinessCheckService();

// In-memory storage for demo (replace with database in production)
let claims = [];

// POST /api/ai/classify_pages - Classify pages for a claim
router.post('/classify_pages', async (req, res) => {
  try {
    const { claimId } = req.body;
    
    if (!claimId) {
      return res.status(400).json({
        success: false,
        error: 'Claim ID is required'
      });
    }

    // Find the claim (in production, this would be from database)
    const claim = claims.find(c => c.id === claimId);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    const classifications = [];

    // Classify each page
    for (const page of claim.pages) {
      const classification = await aiService.classifyPage(page);
      claim.updatePageClassification(page.id, classification);
      
      classifications.push({
        pageId: page.id,
        pageNumber: page.pageNumber,
        type: classification.type,
        confidence: classification.confidence,
        reason: classification.reason
      });
    }

    res.json({
      success: true,
      message: 'Pages classified successfully',
      data: classifications
    });
  } catch (error) {
    console.error('Error classifying pages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to classify pages',
      details: error.message
    });
  }
});

// POST /api/ai/extract/prescription - Extract fields from prescription document
router.post('/extract/prescription', async (req, res) => {
  try {
    const { docId } = req.body;
    
    if (!docId) {
      return res.status(400).json({
        success: false,
        error: 'Document ID is required'
      });
    }

    // Find the prescription document (in production, this would be from database)
    let prescriptionDoc = null;
    for (const claim of claims) {
      prescriptionDoc = claim.prescriptions.find(p => p.id === docId);
      if (prescriptionDoc) break;
    }
    
    if (!prescriptionDoc) {
      return res.status(404).json({
        success: false,
        error: 'Prescription document not found'
      });
    }

    // Extract fields
    const extractedFields = await aiService.extractPrescriptionFields(prescriptionDoc);
    
    // Update the document with extracted data
    prescriptionDoc.extractedData = extractedFields;

    res.json({
      success: true,
      message: 'Prescription fields extracted successfully',
      data: extractedFields
    });
  } catch (error) {
    console.error('Error extracting prescription fields:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract prescription fields',
      details: error.message
    });
  }
});

// POST /api/ai/extract/bill - Extract fields from bill document
router.post('/extract/bill', async (req, res) => {
  try {
    const { docId } = req.body;
    
    if (!docId) {
      return res.status(400).json({
        success: false,
        error: 'Document ID is required'
      });
    }

    // Find the bill document (in production, this would be from database)
    let billDoc = null;
    for (const claim of claims) {
      billDoc = claim.bills.find(b => b.id === docId);
      if (billDoc) break;
    }
    
    if (!billDoc) {
      return res.status(404).json({
        success: false,
        error: 'Bill document not found'
      });
    }

    // Extract fields
    const extractedFields = await aiService.extractBillFields(billDoc);
    
    // Update the document with extracted data
    billDoc.extractedData = extractedFields;

    res.json({
      success: true,
      message: 'Bill fields extracted successfully',
      data: extractedFields
    });
  } catch (error) {
    console.error('Error extracting bill fields:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract bill fields',
      details: error.message
    });
  }
});

// GET /api/ai/checks/:claimId - Get business checks summary for a claim
router.get('/checks/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    
    // Find the claim (in production, this would be from database)
    const claim = claims.find(c => c.id === claimId);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    // Run business checks if not already done
    if (!claim.businessChecks.claimSubtype) {
      const businessChecks = await businessCheckService.runBusinessChecks(claim);
      claim.updateBusinessChecks(businessChecks);
    }

    // Generate summary
    const summary = {
      claimId: claim.id,
      claimSubtype: claim.getClaimSubtype(),
      flags: claim.businessChecks.flags,
      warnings: claim.businessChecks.warnings,
      errors: claim.businessChecks.errors,
      totals: {
        eligibleAmount: claim.businessChecks.eligibleAmount,
        totalAmount: claim.businessChecks.totalAmount
      },
      documentSummary: {
        prescriptions: claim.prescriptions.length,
        bills: claim.bills.length,
        reports: claim.reports.length,
        totalPages: claim.pages.length
      },
      keyIssues: this.generateKeyIssues(claim.businessChecks),
      recommendations: this.generateRecommendations(claim.businessChecks)
    };

    res.json({
      success: true,
      message: 'Business checks summary generated successfully',
      data: summary
    });
  } catch (error) {
    console.error('Error generating business checks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate business checks',
      details: error.message
    });
  }
});

// POST /api/ai/process_claim - Process entire claim with AI
router.post('/process_claim', async (req, res) => {
  try {
    const { claimId } = req.body;
    
    if (!claimId) {
      return res.status(400).json({
        success: false,
        error: 'Claim ID is required'
      });
    }

    // Find the claim (in production, this would be from database)
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
        error: 'Claim has already been processed'
      });
    }

    const results = {
      claimId: claim.id,
      pagesProcessed: 0,
      classifications: [],
      extractions: {
        prescriptions: 0,
        bills: 0
      },
      businessChecks: null
    };

    // Step 1: Classify all pages
    for (const page of claim.pages) {
      const classification = await aiService.classifyPage(page);
      claim.updatePageClassification(page.id, classification);
      
      results.classifications.push({
        pageId: page.id,
        type: classification.type,
        confidence: classification.confidence
      });
      results.pagesProcessed++;
    }

    // Step 2: Group pages into documents
    claim.groupPagesIntoDocuments();

    // Step 3: Extract fields for each document group
    for (const prescriptionGroup of claim.prescriptions) {
      const extractedData = await aiService.extractPrescriptionFields(prescriptionGroup);
      prescriptionGroup.extractedData = extractedData;
      results.extractions.prescriptions++;
    }

    for (const billGroup of claim.bills) {
      const extractedData = await aiService.extractBillFields(billGroup);
      billGroup.extractedData = extractedData;
      results.extractions.bills++;
    }

    // Step 4: Run business checks
    const businessChecks = await businessCheckService.runBusinessChecks(claim);
    claim.updateBusinessChecks(businessChecks);
    results.businessChecks = businessChecks;

    res.json({
      success: true,
      message: 'Claim processed successfully with AI',
      data: results
    });
  } catch (error) {
    console.error('Error processing claim with AI:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process claim with AI',
      details: error.message
    });
  }
});

// Helper methods for generating summaries
function generateKeyIssues(businessChecks) {
  const issues = [];
  
  if (businessChecks.errors.length > 0) {
    issues.push(`Critical: ${businessChecks.errors.length} errors detected`);
  }
  
  if (businessChecks.warnings.length > 0) {
    issues.push(`Warning: ${businessChecks.warnings.length} warnings found`);
  }
  
  if (businessChecks.flags.length > 0) {
    issues.push(`Flag: ${businessChecks.flags.length} flags raised`);
  }
  
  if (businessChecks.amountValidation && !businessChecks.amountValidation.isValid) {
    issues.push('Amount mismatch detected');
  }
  
  if (businessChecks.policyExclusions && businessChecks.policyExclusions.length > 0) {
    issues.push(`${businessChecks.policyExclusions.length} excluded items found`);
  }
  
  return issues;
}

function generateRecommendations(businessChecks) {
  const recommendations = [];
  
  if (businessChecks.claimSubtype === 'specialist') {
    recommendations.push('Specialist claim - verify referral consistency');
    recommendations.push('Check treatment fulfillment against prescriptions');
  }
  
  if (businessChecks.errors.length > 0) {
    recommendations.push('Review and resolve all errors before approval');
  }
  
  if (businessChecks.policyExclusions && businessChecks.policyExclusions.length > 0) {
    recommendations.push('Exclude non-eligible amounts from calculation');
  }
  
  if (businessChecks.amountValidation && !businessChecks.amountValidation.isValid) {
    recommendations.push('Verify bill totals match line item sums');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Claim appears ready for review');
  }
  
  return recommendations;
}

module.exports = router; 