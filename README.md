# Smart Claims – Document Scrutiny App

## Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Akhilesh29/Smart-Claims-Document-Scrutiny-App
   cd smart-claims-document-scrutiny
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```



## Architecture Overview

### System Components

```
Smart Claims App
├── Frontend (React-like SPA)
├── Backend API (Express.js)
├── AI Processing Engine
├── Business Logic Engine
├── Document Processing (OCR + PDF)
└── Data Storage (In-memory for MVP)
```

### Core Services

1. **AIService** - Document classification & field extraction
2. **BusinessCheckService** - Business rule validation & specialist/medical logic
3. **Claim Model** - Data structure & business logic
4. **File Upload Service** - Document management & processing

### Data Flow

```
Upload → Classification → Grouping → Extraction → Business Checks → Review → Decision
```

##  API Endpoints

### Claims Management
- `GET /api/claims/pending` - Get pending claims queue
- `GET /api/claims/:id` - Get claim details
- `POST /api/claims` - Create new claim
- `POST /api/claims/:id/review` - Review decision (approve/reject/request_info)
- `POST /api/claims/:id/process` - Process claim documents
- `GET /api/claims/:id/export` - Export scrutiny report

### AI Processing
- `POST /api/ai/classify_pages` - Classify document pages
- `POST /api/ai/extract/prescription` - Extract prescription fields
- `POST /api/ai/extract/bill` - Extract bill fields
- `GET /api/ai/checks/:claimId` - Get business checks summary
- `POST /api/ai/process_claim` - Process entire claim with AI

### File Upload
- `POST /api/upload/claim` - Upload documents for new claim
- `POST /api/upload/documents/:claimId` - Add documents to existing claim
- `DELETE /api/upload/document/:claimId/:pageId` - Remove document
- `GET /api/upload/claim/:claimId/documents` - Get claim documents

## Data Models & Schemas

### Claim Structure
```json
{
  "id": "uuid",
  "patientName": "string",
  "insurer": "string",
  "status": "pending|approved|rejected|request_info",
  "pages": ["Page[]"],
  "prescriptions": ["PrescriptionGroup[]"],
  "bills": ["BillGroup[]"],
  "businessChecks": "BusinessChecks",
  "reviewerNote": "string",
  "reviewedAt": "datetime"
}
```

### Prescription Fields
```json
{
  "prescription_number": "string|null",
  "prescription_date": "YYYY-MM-DD|null",
  "prescription_time": "HH:MM|null",
  "visit_reason": "string",
  "doctor_sign_and_seal_present": "boolean",
  "doctor_name": "string",
  "doctor_specialty": "string",
  "diagnosis": ["string[]"],
  "prescription_orders": [{
    "item": "string",
    "type": "medicine|supplement|lab",
    "dose": "string|null",
    "frequency": "string|null"
  }],
  "facility_name": "string",
  "facility_address": "string",
  "specialist_prescription": "boolean"
}
```

### Bill Fields
```json
{
  "bill_number": "string|null",
  "bill_date": "YYYY-MM-DD|null",
  "bill_time": "HH:MM|null",
  "line_items": [{
    "name": "string",
    "type": "medicine|supplement|lab",
    "brand": "string|null",
    "composition": "string|null",
    "price": "number",
    "discount": "number|null",
    "final": "number"
  }],
  "total_paid_amount": "number",
  "facility_name": "string",
  "facility_address": "string",
  "tnc_eligible": "boolean"
}
```

## AI & Business Logic

### Document Classification
- **Deterministic approach** using keyword matching and pattern recognition
- **Confidence scoring** based on keyword density
- **Fallback handling** for unclear document types

### Page Grouping Heuristic
```
1. Sort pages by page number
2. Group consecutive pages of same document type
3. Start new group when page number gap > 1
4. Handle out-of-order pages gracefully
```

### Business Rule Engine

#### Specialist vs Medical Claims
- **Specialist Claims**: Require referral consistency, treatment fulfillment checks
- **Medical Claims**: Standard validation with basic business rules

#### Validation Rules
1. **Visit Reason Consistency** - Compare prescription vs bill reasons
2. **Treatment Fulfillment** - Verify prescribed items are billed
3. **Policy Exclusions** - Check against T&C exclusions
4. **Amount Validation** - Verify bill totals match line items
5. **Sign & Seal Check** - Validate doctor signatures

#### T&C Exclusions
```json
{
  "excluded_items": ["protein supplement", "cosmetic procedure"],
  "excluded_categories": ["cosmetic", "elective", "supplement"]
}
```

## Testing

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/BusinessCheckService.test.js
```

### Test Coverage
- **BusinessCheckService**: Core business logic validation
- **Claim Model**: Data structure and methods
- **AI Service**: Document processing and classification
- **API Routes**: Endpoint functionality

## Frontend Features

### User Interface
- **Claims Queue**: Overview of pending claims with quick flags
- **Document Upload**: Drag & drop file upload with validation
- **AI Processing**: Real-time document processing status
- **Claim Review**: Detailed view with business checks and decision tools
- **Export**: Download scrutiny reports in JSON format

### Responsive Design
- Mobile-friendly interface
- Dark mode support
- Accessibility features
- Modern Bootstrap 5 styling

##  Security & Performance

### Security Features
- Helmet.js for security headers
- Rate limiting (100 requests/15min)
- File type validation
- File size limits (10MB per file)
- CORS protection

### Performance Optimizations
- Async document processing
- Efficient page grouping algorithms
- Optimized OCR processing
- Memory-efficient data structures

## Edge Cases Handled

### Document Processing
- **Jumbled pages**: Intelligent grouping by document type and sequence
- **Split bills**: Accurate total calculation across multiple pages
- **Missing metadata**: Graceful fallbacks for incomplete documents
- **OCR failures**: Deterministic extraction with error handling

### Business Logic
- **Amount mismatches**: Tolerance-based validation with detailed reporting
- **Policy exclusions**: Comprehensive T&C checking
- **Missing signatures**: Boolean detection with evidence snippets
- **Specialist validation**: Referral consistency and treatment fulfillment

## Future Enhancements

### Planned Features
- Database integration (PostgreSQL/MongoDB)
- Advanced ML models for better classification
- Real-time collaboration tools
- Advanced reporting and analytics
- Integration with external insurance systems

### Scalability Improvements
- Microservices architecture
- Message queue for document processing
- Caching layer for business rules
- Horizontal scaling support


 
