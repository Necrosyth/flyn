const https = require('https');

const token = 'YOUR_CLOUDFLARE_API_KEY';
const zoneId = '8384b16bf2f0b0679eb3e60777dbf8fb';

const options = {
  hostname: 'api.cloudflare.com',
  path: `/client/v4/zones/${zoneId}/custom_hostnames`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.result) {
        json.result.forEach(h => {
          console.log(`Hostname: ${h.hostname}`);
          console.log(`  Status: ${h.status}`);
          console.log(`  SSL Status: ${h.ssl?.status}`);
          console.log(`  SSL Validation Errors: ${JSON.stringify(h.ssl?.validation_errors || [])}`);
          console.log('');
        });
      } else {
        console.log('Full response:', JSON.stringify(json, null, 2));
      }
    } catch(e) {
      console.log('Raw:', data);
    }
  });
});

req.on('error', console.error);
req.end();
