# Smart Claims API Examples

This document provides comprehensive cURL and Postman examples for testing the Smart Claims Document Scrutiny App.

## 🚀 Quick Start

### Base URL
```
http://localhost:3000/api
```

### Authentication
*Note: This MVP version doesn't require authentication. In production, add appropriate auth headers.*

## 📋 Claims Management

### 1. Create a New Claim
```bash
curl -X POST http://localhost:3000/api/claims \
  -H "Content-Type: application/json" \
  -d '{
    "patientName": "John Doe",
    "insurer": "HealthFirst Insurance"
  }'
```

### 2. Get Pending Claims Queue
```bash
curl -X GET http://localhost:3000/api/claims/pending
```

### 3. Get Claim Details
```bash
curl -X GET http://localhost:3000/api/claims/uuid-here
```

## 📤 Document Upload

### 4. Upload Documents for New Claim
```bash
curl -X POST http://localhost:3000/api/upload/claim \
  -F "patientName=John Doe" \
  -F "insurer=HealthFirst Insurance" \
  -F "documents=@prescription.pdf" \
  -F "documents=@bill.pdf" \
  -F "documents=@lab_report.pdf"
```

## 🤖 AI Processing

### 5. Classify Document Pages
```bash
curl -X POST http://localhost:3000/api/ai/classify_pages \
  -H "Content-Type: application/json" \
  -d '{
    "claimId": "uuid-here"
  }'
```

### 6. Extract Prescription Fields
```bash
curl -X POST http://localhost:3000/api/ai/extract/prescription \
  -H "Content-Type: application/json" \
  -d '{
    "docId": "prescription-group-uuid"
  }'
```

### 7. Extract Bill Fields
```bash
curl -X POST http://localhost:3000/api/ai/extract/bill \
  -H "Content-Type: application/json" \
  -d '{
    "docId": "bill-group-uuid"
  }'
```

### 8. Get Business Checks Summary
```bash
curl -X GET http://localhost:3000/api/ai/checks/uuid-here
```

### 9. Process Entire Claim with AI
```bash
curl -X POST http://localhost:3000/api/ai/process_claim \
  -H "Content-Type: application/json" \
  -d '{
    "claimId": "uuid-here"
  }'
```

## 📝 Claim Review

### 10. Submit Review Decision
```bash
curl -X POST http://localhost:3000/api/claims/uuid-here/review \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "note": "All documents verified. Business checks passed. Claim approved.",
    "reviewerId": "reviewer-001"
  }'
```

### 11. Request More Information
```bash
curl -X POST http://localhost:3000/api/claims/uuid-here/review \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "request_info",
    "note": "Missing doctor signature on prescription. Please provide signed copy.",
    "reviewerId": "reviewer-001"
  }'
```

### 12. Reject Claim
```bash
curl -X POST http://localhost:3000/api/claims/uuid-here/review \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "reject",
    "note": "Claim rejected due to policy exclusions. Protein supplements not covered.",
    "reviewerId": "reviewer-001"
  }'
```

## 📊 Export & Reports

### 13. Export Claim Scrutiny Report
```bash
curl -X GET http://localhost:3000/api/claims/uuid-here/export \
  -H "Accept: application/json" \
  --output "claim-report.json"
```

## 🔍 Document Management

### 14. Get Claim Documents
```bash
curl -X GET http://localhost:3000/api/upload/claim/uuid-here/documents
```

### 15. Remove Document from Claim
```bash
curl -X DELETE http://localhost:3000/api/upload/document/uuid-here/page-uuid
```

## 🧪 Testing Scenarios

### Complete Workflow Example
```bash
# 1. Create claim
CLAIM_ID=$(curl -s -X POST http://localhost:3000/api/claims \
  -H "Content-Type: application/json" \
  -d '{"patientName": "Test Patient", "insurer": "Test Insurance"}' | \
  jq -r '.data.id')

# 2. Upload documents
curl -X POST http://localhost:3000/api/upload/claim \
  -F "patientName=Test Patient" \
  -F "insurer=Test Insurance" \
  -F "documents=@test_prescription.pdf"

# 3. Process with AI
curl -X POST http://localhost:3000/api/ai/process_claim \
  -H "Content-Type: application/json" \
  -d "{\"claimId\": \"$CLAIM_ID\"}"

# 4. Get business checks
curl -X GET "http://localhost:3000/api/ai/checks/$CLAIM_ID"

# 5. Review decision
curl -X POST "http://localhost:3000/api/claims/$CLAIM_ID/review" \
  -H "Content-Type: application/json" \
  -d '{"decision": "approve", "note": "Test approval"}'
```

## 🚨 Error Handling Examples

### File Upload Errors
```bash
# File too large
curl -X POST http://localhost:3000/api/upload/claim \
  -F "patientName=John Doe" \
  -F "insurer=Test Insurance" \
  -F "documents=@large_file.pdf"
# Response: {"success": false, "error": "File too large. Maximum size is 10MB."}

# Invalid file type
curl -X POST http://localhost:3000/api/upload/claim \
  -F "patientName=John Doe" \
  -F "insurer=Test Insurance" \
  -F "documents=@document.txt"
# Response: {"success": false, "error": "File type text/plain not allowed. Only PDF and image files are supported."}
```

### Business Logic Errors
```bash
# Invalid decision
curl -X POST http://localhost:3000/api/claims/uuid-here/review \
  -H "Content-Type: application/json" \
  -d '{"decision": "invalid_decision", "note": "Test"}'
# Response: {"success": false, "error": "Invalid decision. Must be approve, reject, or request_info"}

# Claim not found
curl -X GET http://localhost:3000/api/claims/invalid-uuid
# Response: {"success": false, "error": "Claim not found"}
```

---

**Note:** Replace `uuid-here` with actual claim IDs returned from the API calls. All examples assume the server is running on `localhost:3000`. 