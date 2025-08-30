const { v4: uuidv4 } = require('uuid');

class Claim {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.patientName = data.patientName || '';
    this.insurer = data.insurer || '';
    this.submittedAt = data.submittedAt || new Date().toISOString();
    this.status = data.status || 'pending'; // pending, approved, rejected, request_info
    this.reviewerNote = data.reviewerNote || '';
    this.reviewedAt = data.reviewedAt || null;
    this.reviewerId = data.reviewerId || null;
    
    // Document pages
    this.pages = data.pages || [];
    
    // Extracted documents
    this.prescriptions = data.prescriptions || [];
    this.bills = data.bills || [];
    this.reports = data.reports || [];
    
    // Business checks
    this.businessChecks = data.businessChecks || {
      claimSubtype: null, // 'specialist' or 'medical'
      flags: [],
      warnings: [],
      errors: [],
      eligibleAmount: 0,
      totalAmount: 0
    };
    
    // Metadata
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Add a page to the claim
  addPage(pageData) {
    const page = {
      id: uuidv4(),
      filename: pageData.filename,
      originalName: pageData.originalName,
      mimetype: pageData.mimetype,
      size: pageData.size,
      path: pageData.path,
      pageNumber: pageData.pageNumber || this.pages.length + 1,
      documentType: null, // Will be set by AI classification
      confidence: null,
      extractedText: null,
      createdAt: new Date().toISOString()
    };
    
    this.pages.push(page);
    this.updatedAt = new Date().toISOString();
    return page;
  }

  // Update page classification
  updatePageClassification(pageId, classification) {
    const page = this.pages.find(p => p.id === pageId);
    if (page) {
      page.documentType = classification.type;
      page.confidence = classification.confidence;
      page.extractedText = classification.extractedText;
      this.updatedAt = new Date().toISOString();
    }
  }

  // Group pages into documents
  groupPagesIntoDocuments() {
    // Group by document type
    const prescriptions = this.pages.filter(p => p.documentType === 'prescription');
    const bills = this.pages.filter(p => p.documentType === 'bill');
    const reports = this.pages.filter(p => p.documentType === 'report');

    // Simple grouping heuristic: consecutive pages of same type
    this.prescriptions = this.groupConsecutivePages(prescriptions);
    this.bills = this.groupConsecutivePages(bills);
    this.reports = this.groupConsecutivePages(reports);
  }

  // Simple heuristic for grouping consecutive pages
  groupConsecutivePages(pages) {
    if (pages.length === 0) return [];
    
    const sortedPages = pages.sort((a, b) => a.pageNumber - b.pageNumber);
    const groups = [];
    let currentGroup = [sortedPages[0]];

    for (let i = 1; i < sortedPages.length; i++) {
      const currentPage = sortedPages[i];
      const previousPage = sortedPages[i - 1];
      
      // If pages are consecutive, add to current group
      if (currentPage.pageNumber === previousPage.pageNumber + 1) {
        currentGroup.push(currentPage);
      } else {
        // Start new group
        groups.push({
          id: uuidv4(),
          pages: currentGroup,
          documentId: uuidv4(),
          createdAt: new Date().toISOString()
        });
        currentGroup = [currentPage];
      }
    }
    
    // Add the last group
    if (currentGroup.length > 0) {
      groups.push({
        id: uuidv4(),
        pages: currentGroup,
        documentId: uuidv4(),
        createdAt: new Date().toISOString()
      });
    }

    return groups;
  }

  // Update business checks
  updateBusinessChecks(checks) {
    this.businessChecks = { ...this.businessChecks, ...checks };
    this.updatedAt = new Date().toISOString();
  }

  // Review the claim
  review(decision, note, reviewerId) {
    this.status = decision;
    this.reviewerNote = note;
    this.reviewerId = reviewerId;
    this.reviewedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  // Get quick flags count for queue display
  getQuickFlagsCount() {
    return this.businessChecks.flags.length + 
           this.businessChecks.warnings.length + 
           this.businessChecks.errors.length;
  }

  // Get claim subtype
  getClaimSubtype() {
    if (this.businessChecks.claimSubtype) {
      return this.businessChecks.claimSubtype;
    }
    
    // Determine based on prescriptions
    const hasSpecialistPrescription = this.prescriptions.some(p => 
      p.extractedData && p.extractedData.specialist_prescription
    );
    
    return hasSpecialistPrescription ? 'specialist' : 'medical';
  }

  // Export to JSON
  toJSON() {
    return {
      id: this.id,
      patientName: this.patientName,
      insurer: this.insurer,
      submittedAt: this.submittedAt,
      status: this.status,
      reviewerNote: this.reviewerNote,
      reviewedAt: this.reviewedAt,
      reviewerId: this.reviewerId,
      pages: this.pages,
      prescriptions: this.prescriptions,
      bills: this.bills,
      reports: this.reports,
      businessChecks: this.businessChecks,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Claim; 