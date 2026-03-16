require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/settings', require('./routes/settings'));
app.use('/api/containers', require('./routes/containers'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/monitors', require('./routes/monitors'));

// Serve built React app in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`KumaGen server running on http://localhost:${PORT}`);
});
