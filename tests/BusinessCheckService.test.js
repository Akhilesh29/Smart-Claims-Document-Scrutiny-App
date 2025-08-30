const BusinessCheckService = require('../services/BusinessCheckService');
const Claim = require('../models/Claim');

describe('BusinessCheckService', () => {
    let businessCheckService;
    let mockClaim;

    beforeEach(() => {
        businessCheckService = new BusinessCheckService();
        
        // Create a mock claim for testing
        mockClaim = new Claim({
            patientName: 'John Doe',
            insurer: 'Test Insurance',
            prescriptions: [
                {
                    id: 'prescription-1',
                    extractedData: {
                        specialist_prescription: true,
                        doctor_specialty: 'Cardiology',
                        visit_reason: 'Chest pain evaluation',
                        doctor_sign_and_seal_present: true
                    }
                }
            ],
            bills: [
                {
                    id: 'bill-1',
                    extractedData: {
                        line_items: [
                            { name: 'Cardiology consultation', type: 'medicine', price: 500, final: 500 },
                            { name: 'ECG test', type: 'lab', price: 300, final: 300 }
                        ],
                        total_paid_amount: 800
                    }
                }
            ]
        });
    });

    describe('determineClaimSubtype', () => {
        test('should identify specialist claim when specialist_prescription is true', () => {
            const subtype = businessCheckService.determineClaimSubtype(mockClaim);
            expect(subtype).toBe('specialist');
        });

        test('should identify specialist claim based on doctor specialty', () => {
            const claimWithSpecialty = new Claim({
                prescriptions: [{
                    extractedData: {
                        specialist_prescription: false,
                        doctor_specialty: 'Neurology'
                    }
                }]
            });
            
            const subtype = businessCheckService.determineClaimSubtype(claimWithSpecialty);
            expect(subtype).toBe('specialist');
        });

        test('should identify medical claim when no specialist indicators', () => {
            const medicalClaim = new Claim({
                prescriptions: [{
                    extractedData: {
                        specialist_prescription: false,
                        doctor_specialty: 'General Medicine'
                    }
                }]
            });
            
            const subtype = businessCheckService.determineClaimSubtype(medicalClaim);
            expect(subtype).toBe('medical');
        });
    });

    describe('checkVisitReasonConsistency', () => {
        test('should detect visit reason consistency when reasons match', () => {
            const claimWithMatchingReasons = new Claim({
                prescriptions: [{
                    extractedData: { visit_reason: 'chest pain evaluation' }
                }],
                bills: [{
                    extractedData: { visit_reason: 'chest pain evaluation' }
                }]
            });
            
            const result = businessCheckService.checkVisitReasonConsistency(claimWithMatchingReasons);
            expect(result.isConsistent).toBe(true);
        });

        test('should detect visit reason inconsistency when reasons differ', () => {
            const claimWithDifferentReasons = new Claim({
                prescriptions: [{
                    extractedData: { visit_reason: 'chest pain evaluation' }
                }],
                bills: [{
                    extractedData: { visit_reason: 'routine checkup' }
                }]
            });
            
            const result = businessCheckService.checkVisitReasonConsistency(claimWithDifferentReasons);
            expect(result.isConsistent).toBe(false);
        });
    });

    describe('checkTreatmentFulfillment', () => {
        test('should detect when prescribed treatments are not billed', () => {
            const claimWithMissingTreatments = new Claim({
                prescriptions: [{
                    extractedData: {
                        prescription_orders: [
                            { item: 'aspirin', type: 'medicine' },
                            { item: 'blood test', type: 'lab' }
                        ]
                    }
                }],
                bills: [{
                    extractedData: {
                        line_items: [
                            { name: 'aspirin', type: 'medicine', price: 50, final: 50 }
                        ]
                    }
                }]
            });
            
            const result = businessCheckService.checkTreatmentFulfillment(claimWithMissingTreatments);
            expect(result.isFulfilled).toBe(false);
            expect(result.missingTreatments).toContain('blood test');
        });

        test('should confirm treatment fulfillment when all prescribed items are billed', () => {
            const claimWithFulfilledTreatments = new Claim({
                prescriptions: [{
                    extractedData: {
                        prescription_orders: [
                            { item: 'aspirin', type: 'medicine' }
                        ]
                    }
                }],
                bills: [{
                    extractedData: {
                        line_items: [
                            { name: 'aspirin', type: 'medicine', price: 50, final: 50 }
                        ]
                    }
                }]
            });
            
            const result = businessCheckService.checkTreatmentFulfillment(claimWithFulfilledTreatments);
            expect(result.isFulfilled).toBe(true);
            expect(result.missingTreatments).toHaveLength(0);
        });
    });

    describe('checkPolicyExclusions', () => {
        test('should detect excluded items in bills', () => {
            const claimWithExcludedItems = new Claim({
                bills: [{
                    extractedData: {
                        line_items: [
                            { name: 'protein supplement', type: 'supplement', price: 100, final: 100 },
                            { name: 'regular medicine', type: 'medicine', price: 50, final: 50 }
                        ]
                    }
                }]
            });
            
            const exclusions = businessCheckService.checkPolicyExclusions(claimWithExcludedItems);
            expect(exclusions).toHaveLength(1);
            expect(exclusions[0].item).toBe('protein supplement');
            expect(exclusions[0].reason).toBe('excluded_item');
        });

        test('should detect excluded categories', () => {
            const claimWithExcludedCategory = new Claim({
                bills: [{
                    extractedData: {
                        line_items: [
                            { name: 'vitamin pills', type: 'supplement', price: 75, final: 75 }
                        ]
                    }
                }]
            });
            
            const exclusions = businessCheckService.checkPolicyExclusions(claimWithExcludedCategory);
            expect(exclusions).toHaveLength(1);
            expect(exclusions[0].type).toBe('supplement');
            expect(exclusions[0].reason).toBe('excluded_category');
        });
    });

    describe('validateAmounts', () => {
        test('should validate correct bill totals', () => {
            const claimWithCorrectTotals = new Claim({
                bills: [{
                    extractedData: {
                        line_items: [
                            { name: 'item1', price: 100, final: 100 },
                            { name: 'item2', price: 200, final: 200 }
                        ],
                        total_paid_amount: 300
                    }
                }]
            });
            
            const result = businessCheckService.validateAmounts(claimWithCorrectTotals);
            expect(result.isValid).toBe(true);
        });

        test('should detect amount mismatches', () => {
            const claimWithMismatchedTotals = new Claim({
                bills: [{
                    extractedData: {
                        line_items: [
                            { name: 'item1', price: 100, final: 100 },
                            { name: 'item2', price: 200, final: 200 }
                        ],
                        total_paid_amount: 250
                    }
                }]
            });
            
            const result = businessCheckService.validateAmounts(claimWithMismatchedTotals);
            expect(result.isValid).toBe(false);
            expect(result.details.difference).toBe(50);
        });
    });

    describe('calculateEligibleAmount', () => {
        test('should exclude non-eligible items from calculation', () => {
            const claimWithMixedItems = new Claim({
                bills: [{
                    extractedData: {
                        line_items: [
                            { name: 'regular medicine', type: 'medicine', price: 100, final: 100 },
                            { name: 'protein supplement', type: 'supplement', price: 50, final: 50 }
                        ]
                    }
                }]
            });
            
            // Mock the policy exclusions
            const mockChecks = {
                policyExclusions: [
                    { item: 'protein supplement' }
                ]
            };
            
            const eligibleAmount = businessCheckService.calculateEligibleAmount(claimWithMixedItems, mockChecks);
            expect(eligibleAmount).toBe(100);
        });
    });

    describe('runBusinessChecks', () => {
        test('should run all business checks and return comprehensive results', async () => {
            const checks = await businessCheckService.runBusinessChecks(mockClaim);
            
            expect(checks).toHaveProperty('claimSubtype');
            expect(checks).toHaveProperty('flags');
            expect(checks).toHaveProperty('warnings');
            expect(checks).toHaveProperty('errors');
            expect(checks).toHaveProperty('eligibleAmount');
            expect(checks).toHaveProperty('totalAmount');
        });

        test('should run specialist-specific checks for specialist claims', async () => {
            const checks = await businessCheckService.runBusinessChecks(mockClaim);
            
            expect(checks.claimSubtype).toBe('specialist');
            expect(checks.visitReasonConsistency).toBeDefined();
            expect(checks.treatmentFulfillment).toBeDefined();
        });
    });
}); 