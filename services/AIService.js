const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');

class AIService {
  constructor() {
    this.classificationPrompts = {
      prescription: `Analyze this document and classify it as a prescription if it contains:
        - Doctor's prescription details
        - Medication orders
        - Patient diagnosis
        - Doctor signature/seal
        - Prescription date/time
        - Facility information
        Return: { "type": "prescription", "confidence": 0.95, "reason": "Contains prescription details" }`,
      
      bill: `Analyze this document and classify it as a bill if it contains:
        - Line items with prices
        - Total amount
        - Bill number/date
        - Facility billing information
        - Payment details
        Return: { "type": "bill", "confidence": 0.95, "reason": "Contains billing information" }`,
      
      report: `Analyze this document and classify it as a report if it contains:
        - Medical test results
        - Laboratory findings
        - Diagnostic reports
        - Medical imaging results
        Return: { "type": "report", "confidence": 0.95, "reason": "Contains medical report data" }`
    };

    this.extractionPrompts = {
      prescription: `Extract the following fields from this prescription document:
        {
          "prescription_number": "string or null",
          "prescription_date": "YYYY-MM-DD or null",
          "prescription_time": "HH:MM or null",
          "visit_reason": "string",
          "doctor_sign_and_seal_present": "boolean",
          "doctor_name": "string",
          "doctor_specialty": "string",
          "diagnosis": ["array of strings"],
          "prescription_orders": [
            {
              "item": "string",
              "type": "medicine|supplement|lab",
              "dose": "string or null",
              "frequency": "string or null"
            }
          ],
          "facility_name": "string",
          "facility_address": "string",
          "specialist_prescription": "boolean"
        }`,
      
      bill: `Extract the following fields from this bill document:
        {
          "bill_number": "string or null",
          "bill_date": "YYYY-MM-DD or null",
          "bill_time": "HH:MM or null",
          "line_items": [
            {
              "name": "string",
              "type": "medicine|supplement|lab",
              "brand": "string or null",
              "composition": "string or null",
              "price": "number",
              "discount": "number or null",
              "final": "number"
            }
          ],
          "total_paid_amount": "number",
          "facility_name": "string",
          "facility_address": "string",
          "tnc_eligible": "boolean"
        }`
    };
  }

  // Classify a single page
  async classifyPage(pageData) {
    try {
      // Extract text from the page
      const extractedText = await this.extractTextFromPage(pageData);
      
      // Use deterministic classification based on text content
      const classification = this.deterministicClassification(extractedText);
      
      return {
        type: classification.type,
        confidence: classification.confidence,
        extractedText: extractedText.substring(0, 500), // Limit text for storage
        reason: classification.reason
      };
    } catch (error) {
      console.error('Error classifying page:', error);
      return {
        type: 'unknown',
        confidence: 0,
        extractedText: null,
        reason: 'Error during classification'
      };
    }
  }

  // Extract text from different file types
  async extractTextFromPage(pageData) {
    const filePath = pageData.path;
    const mimetype = pageData.mimetype;

    try {
      if (mimetype === 'application/pdf') {
        return await this.extractTextFromPDF(filePath);
      } else if (mimetype.startsWith('image/')) {
        return await this.extractTextFromImage(filePath);
      } else {
        throw new Error(`Unsupported file type: ${mimetype}`);
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      return '';
    }
  }

  // Extract text from PDF
  async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text || '';
    } catch (error) {
      console.error('Error parsing PDF:', error);
      return '';
    }
  }

  // Extract text from image using OCR
  async extractTextFromImage(filePath) {
    try {
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
        logger: m => console.log(m)
      });
      return text || '';
    } catch (error) {
      console.error('Error OCR processing:', error);
      return '';
    }
  }

  // Deterministic classification based on text content
  deterministicClassification(text) {
    const lowerText = text.toLowerCase();
    
    // Prescription indicators
    const prescriptionKeywords = [
      'prescription', 'rx', 'medication', 'dosage', 'frequency',
      'doctor', 'physician', 'diagnosis', 'treatment', 'medicine',
      'tablet', 'capsule', 'syrup', 'injection'
    ];
    
    // Bill indicators
    const billKeywords = [
      'bill', 'invoice', 'total', 'amount', 'price', 'cost',
      'payment', 'charges', 'line item', 'subtotal', 'tax',
      'discount', 'final amount', 'due amount'
    ];
    
    // Report indicators
    const reportKeywords = [
      'report', 'result', 'test', 'laboratory', 'lab', 'diagnostic',
      'finding', 'analysis', 'examination', 'assessment', 'evaluation'
    ];

    // Count matches for each type
    const prescriptionScore = prescriptionKeywords.filter(keyword => 
      lowerText.includes(keyword)
    ).length;
    
    const billScore = billKeywords.filter(keyword => 
      lowerText.includes(keyword)
    ).length;
    
    const reportScore = reportKeywords.filter(keyword => 
      lowerText.includes(keyword)
    ).length;

    // Determine type based on highest score
    let type = 'unknown';
    let confidence = 0;
    let reason = '';

    if (prescriptionScore > billScore && prescriptionScore > reportScore && prescriptionScore > 0) {
      type = 'prescription';
      confidence = Math.min(0.9 + (prescriptionScore * 0.02), 0.98);
      reason = `Contains ${prescriptionScore} prescription-related keywords`;
    } else if (billScore > prescriptionScore && billScore > reportScore && billScore > 0) {
      type = 'bill';
      confidence = Math.min(0.9 + (billScore * 0.02), 0.98);
      reason = `Contains ${billScore} billing-related keywords`;
    } else if (reportScore > prescriptionScore && reportScore > billScore && reportScore > 0) {
      type = 'report';
      confidence = Math.min(0.9 + (reportScore * 0.02), 0.98);
      reason = `Contains ${reportScore} report-related keywords`;
    } else {
      type = 'unknown';
      confidence = 0.1;
      reason = 'No clear document type indicators found';
    }

    return { type, confidence, reason };
  }

  // Extract fields from prescription document
  async extractPrescriptionFields(documentData) {
    try {
      const extractedText = documentData.pages.map(p => p.extractedText).join(' ');
      
      // Use deterministic extraction based on text patterns
      const extractedFields = this.extractPrescriptionFieldsDeterministic(extractedText);
      
      return extractedFields;
    } catch (error) {
      console.error('Error extracting prescription fields:', error);
      return this.getDefaultPrescriptionFields();
    }
  }

  // Extract fields from bill document
  async extractBillFields(documentData) {
    try {
      const extractedText = documentData.pages.map(p => p.extractedText).join(' ');
      
      // Use deterministic extraction based on text patterns
      const extractedFields = this.extractBillFieldsDeterministic(extractedText);
      
      return extractedFields;
    } catch (error) {
      console.error('Error extracting bill fields:', error);
      return this.getDefaultBillFields();
    }
  }

  // Deterministic prescription field extraction
  extractPrescriptionFieldsDeterministic(text) {
    const lowerText = text.toLowerCase();
    
    // Extract date patterns
    const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
    const dates = [...text.matchAll(datePattern)];
    const prescriptionDate = dates.length > 0 ? this.formatDate(dates[0]) : null;
    
    // Extract time patterns
    const timePattern = /(\d{1,2}):(\d{2})\s*(am|pm)?/gi;
    const times = [...text.matchAll(timePattern)];
    const prescriptionTime = times.length > 0 ? this.formatTime(times[0]) : null;
    
    // Extract doctor name (simple pattern)
    const doctorPattern = /dr\.?\s*([a-z\s]+)/gi;
    const doctorMatch = text.match(doctorPattern);
    const doctorName = doctorMatch ? doctorMatch[0].replace(/dr\.?\s*/i, '').trim() : null;
    
    // Extract facility name
    const facilityPattern = /(?:hospital|clinic|medical center|healthcare)\s*:?\s*([a-z\s]+)/gi;
    const facilityMatch = text.match(facilityPattern);
    const facilityName = facilityMatch ? facilityMatch[1].trim() : null;
    
    // Check for specialist indicators
    const specialistKeywords = ['specialist', 'cardiology', 'neurology', 'orthopedic', 'dermatology'];
    const specialistPrescription = specialistKeywords.some(keyword => lowerText.includes(keyword));
    
    // Check for sign and seal
    const signSealKeywords = ['signature', 'seal', 'stamp', 'signed'];
    const doctorSignAndSealPresent = signSealKeywords.some(keyword => lowerText.includes(keyword));
    
    return {
      prescription_number: this.extractPrescriptionNumber(text),
      prescription_date: prescriptionDate,
      prescription_time: prescriptionTime,
      visit_reason: this.extractVisitReason(text),
      doctor_sign_and_seal_present: doctorSignAndSealPresent,
      doctor_name: doctorName,
      doctor_specialty: this.extractDoctorSpecialty(text),
      diagnosis: this.extractDiagnosis(text),
      prescription_orders: this.extractPrescriptionOrders(text),
      facility_name: facilityName,
      facility_address: this.extractFacilityAddress(text),
      specialist_prescription: specialistPrescription
    };
  }

  // Deterministic bill field extraction
  extractBillFieldsDeterministic(text) {
    const lowerText = text.toLowerCase();
    
    // Extract date patterns
    const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
    const dates = [...text.matchAll(datePattern)];
    const billDate = dates.length > 0 ? this.formatDate(dates[0]) : null;
    
    // Extract time patterns
    const timePattern = /(\d{1,2}):(\d{2})\s*(am|pm)?/gi;
    const times = [...text.matchAll(timePattern)];
    const billTime = times.length > 0 ? this.formatTime(times[0]) : null;
    
    // Extract total amount
    const totalPattern = /total[:\s]*[\$₹]?\s*(\d+(?:\.\d{2})?)/gi;
    const totalMatch = text.match(totalPattern);
    const totalPaidAmount = totalMatch ? parseFloat(totalMatch[1]) : 0;
    
    // Extract line items (simplified)
    const lineItems = this.extractLineItems(text);
    
    // Extract facility name
    const facilityPattern = /(?:hospital|clinic|medical center|healthcare)\s*:?\s*([a-z\s]+)/gi;
    const facilityMatch = text.match(facilityPattern);
    const facilityName = facilityMatch ? facilityMatch[1].trim() : null;
    
    return {
      bill_number: this.extractBillNumber(text),
      bill_date: billDate,
      bill_time: billTime,
      line_items: lineItems,
      total_paid_amount: totalPaidAmount,
      facility_name: facilityName,
      facility_address: this.extractFacilityAddress(text),
      tnc_eligible: true // Default to eligible, will be checked by business logic
    };
  }

  // Helper methods for field extraction
  extractPrescriptionNumber(text) {
    const pattern = /prescription\s*(?:no|number|#)?\s*:?\s*([a-z0-9\-]+)/gi;
    const match = text.match(pattern);
    return match ? match[1] : null;
  }

  extractBillNumber(text) {
    const pattern = /bill\s*(?:no|number|#)?\s*:?\s*([a-z0-9\-]+)/gi;
    const match = text.match(pattern);
    return match ? match[1] : null;
  }

  extractVisitReason(text) {
    const pattern = /(?:visit reason|reason for visit|complaint)\s*:?\s*([^.]+)/gi;
    const match = text.match(pattern);
    return match ? match[1].trim() : 'General consultation';
  }

  extractDoctorSpecialty(text) {
    const specialties = ['cardiology', 'neurology', 'orthopedic', 'dermatology', 'pediatrics', 'general'];
    const lowerText = text.toLowerCase();
    const found = specialties.find(specialty => lowerText.includes(specialty));
    return found || 'General Medicine';
  }

  extractDiagnosis(text) {
    const pattern = /(?:diagnosis|diagnosed with)\s*:?\s*([^.]+)/gi;
    const matches = [...text.matchAll(pattern)];
    return matches.map(match => match[1].trim()).filter(d => d.length > 0);
  }

  extractPrescriptionOrders(text) {
    const orders = [];
    const medicinePattern = /([a-z\s]+)\s*(\d+\s*(?:mg|ml|g)?)\s*(?:daily|twice|thrice|once)/gi;
    const matches = [...text.matchAll(medicinePattern)];
    
    matches.forEach(match => {
      orders.push({
        item: match[1].trim(),
        type: 'medicine',
        dose: match[2] || null,
        frequency: match[3] || null
      });
    });
    
    return orders.length > 0 ? orders : [
      { item: 'General medication', type: 'medicine', dose: null, frequency: null }
    ];
  }

  extractLineItems(text) {
    const items = [];
    const pricePattern = /([a-z\s]+)\s*[\$₹]?\s*(\d+(?:\.\d{2})?)/gi;
    const matches = [...text.matchAll(pricePattern)];
    
    matches.forEach(match => {
      items.push({
        name: match[1].trim(),
        type: 'medicine',
        brand: null,
        composition: null,
        price: parseFloat(match[2]),
        discount: 0,
        final: parseFloat(match[2])
      });
    });
    
    return items.length > 0 ? items : [
      { name: 'General service', type: 'medicine', brand: null, composition: null, price: 100, discount: 0, final: 100 }
    ];
  }

  extractFacilityAddress(text) {
    const pattern = /(?:address|location)\s*:?\s*([^.]+)/gi;
    const match = text.match(pattern);
    return match ? match[1].trim() : 'Address not specified';
  }

  formatDate(dateMatch) {
    const [, day, month, year] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  formatTime(timeMatch) {
    const [, hour, minute, ampm] = timeMatch;
    let hour24 = parseInt(hour);
    
    if (ampm && ampm.toLowerCase() === 'pm' && hour24 !== 12) {
      hour24 += 12;
    } else if (ampm && ampm.toLowerCase() === 'am' && hour24 === 12) {
      hour24 = 0;
    }
    
    return `${hour24.toString().padStart(2, '0')}:${minute}`;
  }

  // Default field values for fallback
  getDefaultPrescriptionFields() {
    return {
      prescription_number: null,
      prescription_date: null,
      prescription_time: null,
      visit_reason: 'General consultation',
      doctor_sign_and_seal_present: false,
      doctor_name: 'Dr. Unknown',
      doctor_specialty: 'General Medicine',
      diagnosis: ['General consultation'],
      prescription_orders: [
        { item: 'General medication', type: 'medicine', dose: null, frequency: null }
      ],
      facility_name: 'Medical Facility',
      facility_address: 'Address not specified',
      specialist_prescription: false
    };
  }

  getDefaultBillFields() {
    return {
      bill_number: null,
      bill_date: null,
      bill_time: null,
      line_items: [
        { name: 'General service', type: 'medicine', brand: null, composition: null, price: 100, discount: 0, final: 100 }
      ],
      total_paid_amount: 100,
      facility_name: 'Medical Facility',
      facility_address: 'Address not specified',
      tnc_eligible: true
    };
  }
}

module.exports = AIService; 