const WebSocket = require('ws');
const fs = require('fs');
const creds = JSON.parse(fs.readFileSync(require('os').homedir() + '/.livinity/credentials.json', 'utf8'));

console.log('Token length:', creds.deviceToken.length);
console.log('Token start:', creds.deviceToken.slice(0, 30));
console.log('Relay:', creds.relayUrl);
console.log('DeviceId:', creds.deviceId);

const ws = new WebSocket(creds.relayUrl + '/device/connect');
ws.on('open', () => {
  console.log('WS open, sending auth...');
  const msg = JSON.stringify({
    type: 'device_auth',
    token: creds.deviceToken,
    deviceId: creds.deviceId,
    deviceName: creds.deviceName,
    platform: creds.platform,
    tools: ['shell', 'files_list'],
  });
  console.log('Auth msg length:', msg.length);
  ws.send(msg);
});
ws.on('message', (d) => {
  const parsed = JSON.parse(d.toString());
  console.log('Response:', parsed.type, parsed.error || parsed.sessionId || '');
  if (parsed.type === 'device_connected') {
    console.log('SUCCESS - CONNECTED!');
    setTimeout(() => { ws.close(); process.exit(0); }, 1000);
  } else {
    ws.close();
    process.exit(1);
  }
});
ws.on('error', (e) => console.log('Error:', e.message));
ws.on('close', (code) => console.log('Closed:', code));
setTimeout(() => process.exit(1), 10000);
