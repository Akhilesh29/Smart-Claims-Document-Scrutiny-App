const fs = require('fs').promises;
const path = require('path');

class BusinessCheckService {
  constructor() {
    this.tncExclusions = null;
    this.loadTncExclusions();
  }

  // Load T&C exclusions from JSON file
  async loadTncExclusions() {
    try {
      const tncPath = path.join(__dirname, '../data/tnc_exclusions.json');
      const data = await fs.readFile(tncPath, 'utf8');
      this.tncExclusions = JSON.parse(data);
    } catch (error) {
      // Fallback to default exclusions
      this.tncExclusions = {
        excluded_items: [
          "protein supplement",
          "cosmetic procedure",
          "vitamin supplements",
          "dietary supplements",
          "cosmetic surgery",
          "elective procedures"
        ],
        excluded_categories: [
          "cosmetic",
          "elective",
          "supplement"
        ]
      };
    }
  }

  // Run all business checks for a claim
  async runBusinessChecks(claim) {
    const checks = {
      claimSubtype: this.determineClaimSubtype(claim),
      flags: [],
      warnings: [],
      errors: [],
      eligibleAmount: 0,
      totalAmount: 0,
      visitReasonConsistency: null,
      treatmentFulfillment: null,
      policyExclusions: [],
      amountValidation: null
    };

    // Run subtype-specific checks
    if (checks.claimSubtype === 'specialist') {
      await this.runSpecialistChecks(claim, checks);
    } else {
      await this.runMedicalChecks(claim, checks);
    }

    // Run common checks
    await this.runCommonChecks(claim, checks);

    // Calculate amounts
    checks.eligibleAmount = this.calculateEligibleAmount(claim, checks);
    checks.totalAmount = this.calculateTotalAmount(claim);

    return checks;
  }

  // Determine claim subtype
  determineClaimSubtype(claim) {
    // Check if any prescription is marked as specialist
    const hasSpecialistPrescription = claim.prescriptions.some(p => 
      p.extractedData && p.extractedData.specialist_prescription === true
    );

    // Check doctor specialty for specialist indicators
    const hasSpecialistDoctor = claim.prescriptions.some(p => {
      if (!p.extractedData || !p.extractedData.doctor_specialty) return false;
      const specialty = p.extractedData.doctor_specialty.toLowerCase();
      return specialty.includes('specialist') || 
             specialty.includes('cardiology') || 
             specialty.includes('neurology') ||
             specialty.includes('orthopedic') ||
             specialty.includes('dermatology');
    });

    return (hasSpecialistPrescription || hasSpecialistDoctor) ? 'specialist' : 'medical';
  }

  // Run specialist-specific checks
  async runSpecialistChecks(claim, checks) {
    // Visit Reason Consistency Check
    checks.visitReasonConsistency = this.checkVisitReasonConsistency(claim);
    if (!checks.visitReasonConsistency.isConsistent) {
      checks.flags.push({
        type: 'visit_reason_mismatch',
        severity: 'warning',
        message: 'Visit reason differs from referral reason.',
        details: checks.visitReasonConsistency.details
      });
    }

    // Treatment Fulfillment Check
    checks.treatmentFulfillment = this.checkTreatmentFulfillment(claim);
    if (!checks.treatmentFulfillment.isFulfilled) {
      checks.warnings.push({
        type: 'treatment_not_fulfilled',
        severity: 'warning',
        message: 'Some prescribed treatments were not billed.',
        details: checks.treatmentFulfillment.missingTreatments
      });
    }
  }

  // Run medical claim checks
  async runMedicalChecks(claim, checks) {
    // Basic validation for medical claims
    checks.warnings.push({
      type: 'medical_claim',
      severity: 'info',
      message: 'Standard medical claim - basic validation applied.'
    });
  }

  // Run common checks for all claim types
  async runCommonChecks(claim, checks) {
    // Policy T&C Exclusions Check
    const exclusions = this.checkPolicyExclusions(claim);
    if (exclusions.length > 0) {
      checks.policyExclusions = exclusions;
      checks.errors.push({
        type: 'policy_exclusion',
        severity: 'error',
        message: `${exclusions.length} excluded items detected.`,
        details: exclusions
      });
    }

    // Amount Validation
    checks.amountValidation = this.validateAmounts(claim);
    if (!checks.amountValidation.isValid) {
      checks.errors.push({
        type: 'amount_mismatch',
        severity: 'error',
        message: 'Bill total does not match line item sum.',
        details: checks.amountValidation.details
      });
    }

    // Missing Sign & Seal Check
    const missingSignSeal = this.checkMissingSignSeal(claim);
    if (missingSignSeal.length > 0) {
      checks.warnings.push({
        type: 'missing_sign_seal',
        severity: 'warning',
        message: `${missingSignSeal.length} documents missing doctor signature/seal.`,
        details: missingSignSeal
      });
    }
  }

  // Check visit reason consistency
  checkVisitReasonConsistency(claim) {
    const prescriptions = claim.prescriptions.filter(p => p.extractedData);
    const bills = claim.bills.filter(b => b.extractedData);

    if (prescriptions.length === 0 || bills.length === 0) {
      return { isConsistent: true, details: 'Insufficient data for comparison' };
    }

    const visitReasons = prescriptions.map(p => 
      p.extractedData.visit_reason?.toLowerCase() || ''
    ).filter(r => r.length > 0);

    const billReasons = bills.map(b => 
      b.extractedData.visit_reason?.toLowerCase() || ''
    ).filter(r => r.length > 0);

    // Simple keyword matching
    const commonKeywords = this.findCommonKeywords([...visitReasons, ...billReasons]);
    
    return {
      isConsistent: commonKeywords.length > 0,
      details: {
        prescriptionReasons: visitReasons,
        billReasons: billReasons,
        commonKeywords
      }
    };
  }

  // Check treatment fulfillment
  checkTreatmentFulfillment(claim) {
    const prescriptions = claim.prescriptions.filter(p => p.extractedData);
    const bills = claim.bills.filter(b => b.extractedData);

    if (prescriptions.length === 0 || bills.length === 0) {
      return { isFulfilled: true, missingTreatments: [] };
    }

    const prescribedItems = prescriptions.flatMap(p => 
      p.extractedData.prescription_orders || []
    ).map(item => item.item?.toLowerCase() || '');

    const billedItems = bills.flatMap(b => 
      b.extractedData.line_items || []
    ).map(item => item.name?.toLowerCase() || '');

    const missingTreatments = prescribedItems.filter(item => 
      item.length > 0 && !billedItems.some(billed => 
        billed.includes(item) || item.includes(billed)
      )
    );

    return {
      isFulfilled: missingTreatments.length === 0,
      missingTreatments
    };
  }

  // Check policy exclusions
  checkPolicyExclusions(claim) {
    const bills = claim.bills.filter(b => b.extractedData);
    const exclusions = [];

    bills.forEach(bill => {
      const lineItems = bill.extractedData.line_items || [];
      lineItems.forEach(item => {
        const itemName = item.name?.toLowerCase() || '';
        const itemType = item.type?.toLowerCase() || '';

        // Check against excluded items
        const isExcluded = this.tncExclusions.excluded_items.some(excluded => 
          itemName.includes(excluded.toLowerCase())
        );

        // Check against excluded categories
        const isExcludedCategory = this.tncExclusions.excluded_categories.some(category => 
          itemType.includes(category.toLowerCase())
        );

        if (isExcluded || isExcludedCategory) {
          exclusions.push({
            item: item.name,
            type: item.type,
            reason: isExcluded ? 'excluded_item' : 'excluded_category',
            amount: item.final || item.price
          });
        }
      });
    });

    return exclusions;
  }

  // Validate amounts
  validateAmounts(claim) {
    const bills = claim.bills.filter(b => b.extractedData);
    
    for (const bill of bills) {
      const lineItems = bill.extractedData.line_items || [];
      const totalPaid = bill.extractedData.total_paid_amount || 0;
      
      const calculatedTotal = lineItems.reduce((sum, item) => {
        const finalPrice = item.final || item.price || 0;
        return sum + finalPrice;
      }, 0);

      const tolerance = 0.01; // Allow 1 cent difference for rounding
      if (Math.abs(calculatedTotal - totalPaid) > tolerance) {
        return {
          isValid: false,
          details: {
            billId: bill.id,
            calculatedTotal: parseFloat(calculatedTotal.toFixed(2)),
            totalPaid: parseFloat(totalPaid.toFixed(2)),
            difference: parseFloat((calculatedTotal - totalPaid).toFixed(2))
          }
        };
      }
    }

    return { isValid: true, details: null };
  }

  // Check missing sign and seal
  checkMissingSignSeal(claim) {
    const prescriptions = claim.prescriptions.filter(p => p.extractedData);
    const missing = [];

    prescriptions.forEach(prescription => {
      const hasSignSeal = prescription.extractedData.doctor_sign_and_seal_present;
      if (!hasSignSeal) {
        missing.push({
          prescriptionId: prescription.id,
          doctorName: prescription.extractedData.doctor_name || 'Unknown',
          facility: prescription.extractedData.facility_name || 'Unknown'
        });
      }
    });

    return missing;
  }

  // Calculate eligible amount
  calculateEligibleAmount(claim, checks) {
    const bills = claim.bills.filter(b => b.extractedData);
    let eligibleAmount = 0;

    bills.forEach(bill => {
      const lineItems = bill.extractedData.line_items || [];
      lineItems.forEach(item => {
        const isExcluded = checks.policyExclusions.some(exclusion => 
          exclusion.item === item.name
        );
        
        if (!isExcluded) {
          eligibleAmount += item.final || item.price || 0;
        }
      });
    });

    return parseFloat(eligibleAmount.toFixed(2));
  }

  // Calculate total amount
  calculateTotalAmount(claim) {
    const bills = claim.bills.filter(b => b.extractedData);
    let totalAmount = 0;

    bills.forEach(bill => {
      totalAmount += bill.extractedData.total_paid_amount || 0;
    });

    return parseFloat(totalAmount.toFixed(2));
  }

  // Find common keywords between arrays of strings
  findCommonKeywords(stringArrays) {
    if (stringArrays.length === 0) return [];

    const words = stringArrays.flatMap(str => 
      str.split(/\s+/).filter(word => word.length > 3)
    );

    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.entries(wordCount)
      .filter(([word, count]) => count > 1)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }
}

module.exports = BusinessCheckService; 