const { app } = require('electron');
try {
  console.log('UserData Path:', app.getPath('userData'));
  process.exit(0);
} catch (e) {
  console.error('Failed to get path:', e);
  process.exit(1);
}
