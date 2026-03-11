try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  console.log('SUCCESS: better-sqlite3 loaded and working');
  process.exit(0);
} catch (e) {
  console.error('FAILURE: better-sqlite3 failed to load');
  console.error(e);
  process.exit(1);
}
