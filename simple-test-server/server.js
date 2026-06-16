const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3100;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(bodyParser.json());
// Parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for requests
let receivedRequests = [];

app.post('/post', (req, res) => {
    console.log('--- Received POST request ---');

    const newRequest = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        method: 'POST',
        headers: req.headers,
        body: req.body,
        query: req.query
    };

    // Add to front of array
    receivedRequests.unshift(newRequest);

    // Limit to last 50 requests
    if (receivedRequests.length > 50) {
        receivedRequests.pop();
    }

    // Construct response similar to httpbin.org/post
    const response = {
        args: req.query,
        data: JSON.stringify(req.body),
        files: {},
        form: {},
        headers: req.headers,
        json: req.body,
        origin: req.connection.remoteAddress,
        url: `http://localhost:${PORT}/post`
    };

    res.json(response);
});

// API to get requests
app.get('/api/requests', (req, res) => {
    res.json(receivedRequests);
});

// API to clear requests
app.delete('/api/requests', (req, res) => {
    receivedRequests = [];
    res.json({ success: true, message: 'Requests cleared' });
});

app.listen(PORT, () => {
    console.log(`Simple test server running at http://localhost:${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/post`);
    console.log(`Web Interface: http://localhost:${PORT}`);
});
