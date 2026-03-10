const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supaStr = fs.readFileSync('./electron/supabase.ts', 'utf8');
const matchUrl = supaStr.match(/const SUPABASE_URL = '(.*?)'/);
const matchKey = supaStr.match(/const SUPABASE_ANON_KEY = '(.*?)'/);

if (matchUrl && matchKey) {
  const supabase = createClient(matchUrl[1], matchKey[1]);
  async function run() {
    const email = 'talhach655@gmail.com';
    
    console.log("Checking tenants...");
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('*').eq('email', email);
    console.log("Tenants:", tenants, tErr);

    console.log("Checking staff...");
    const { data: staff, error: sErr } = await supabase.from('staff').select('*').eq('email', email);
    console.log("Staff:", staff, sErr);
    
    console.log("Checking users...");
    const { data: users, error: uErr } = await supabase.from('users').select('*').eq('email', email);
    console.log("Users:", users, uErr);
  }
  run();
}
