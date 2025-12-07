// Import Express framework
const express = require('express');
const path = require('path');

console.log('Step 1: Starting server setup...');

// Create Express application
const app = express();

console.log('Step 2: Express app created');

// Define port number (where server will listen)
const PORT = 3000;

console.log('Step 3: Port set to', PORT);

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

console.log('Step 4: Static files configured');

// Route: When user visits '/', send index.html
app.get('/', (req, res) => {
    console.log('Someone requested the homepage');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

console.log('Step 5: Routes configured');

// Start server with error handling
const server = app.listen(PORT, () => {
    console.log('===========================================');
    console.log('SERVER STARTED SUCCESSFULLY!');
    console.log(`Open: http://localhost:${PORT}`);
    console.log('===========================================');
}).on('error', (err) => {
    console.error('ERROR STARTING SERVER:', err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use!`);
        console.error('Try closing other programs or use a different port.');
    }
});

console.log('Step 6: Server listen called');