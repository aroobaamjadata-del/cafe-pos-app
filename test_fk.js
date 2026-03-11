const db = require('better-sqlite3')(':memory:');
db.pragma('foreign_keys = ON');
db.exec('CREATE TABLE cats (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);');
db.exec('CREATE TABLE prods (id INTEGER PRIMARY KEY AUTOINCREMENT, cat_id INTEGER REFERENCES cats(id), name TEXT);');

try {
  db.prepare('INSERT INTO cats (id, name) VALUES(?,?)').run('uuid-123', 'Cat');
  console.log('cat inserted');
} catch(e) { console.error('Cats error:', e.message); }

console.log('cats:', db.prepare('SELECT * FROM cats').all());

try {
  db.prepare('INSERT INTO prods (id, cat_id, name) VALUES(?,?,?)').run('uuid-abc', 'uuid-123', 'Prod');
  console.log('prod inserted successfully!');
} catch(e) { console.error('Prods Error:', e.message); }

console.log('prods:', db.prepare('SELECT * FROM prods').all());
