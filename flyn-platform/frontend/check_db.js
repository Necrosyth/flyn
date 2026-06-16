const https = require('https');

// Make a request to the backend to get the custom hostname info
const options = {
  hostname: 'pjpmzvu7wn.us-east-1.awsapprunner.com',
  path: '/api/domains/custom-hostnames',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer test-token'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Response:', JSON.stringify(JSON.parse(data), null, 2).substring(0, 1000));
  });
});

req.on('error', e => console.log('Error:', e.message));
req.end();
