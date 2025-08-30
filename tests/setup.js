// Test setup file
process.env.NODE_ENV = 'test';

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn()
  }
}));

// Mock Tesseract.js
jest.mock('tesseract.js', () => ({
  recognize: jest.fn().mockResolvedValue({
    data: { text: 'Mock extracted text' }
  })
}));

// Mock pdf-parse
jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({
  text: 'Mock PDF text'
})); 