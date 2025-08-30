const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;

// Import route handlers
const claimsRoutes = require('./routes/claims');
const aiRoutes = require('./routes/ai');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// API routes
app.use('/api/claims', claimsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Create uploads directory if it doesn't exist
async function ensureDirectories() {
  try {
    await fs.mkdir('uploads', { recursive: true });
    await fs.mkdir('data', { recursive: true });
    console.log('Directories created successfully');
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Start server
async function startServer() {
  await ensureDirectories();
  
  app.listen(PORT, () => {
    console.log(`Smart Claims Server running on port ${PORT}`);
    console.log(` Frontend: http://localhost:${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
  });
}

startServer().catch(console.error);

module.exports = app; 
