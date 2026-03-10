const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supaStr = fs.readFileSync('./electron/supabase.ts', 'utf8');
const matchUrl = supaStr.match(/const SUPABASE_URL = '(.*?)'/);
const matchKey = supaStr.match(/const SUPABASE_ANON_KEY = '(.*?)'/);

async function run() {
  const supabase = createClient(matchUrl[1], matchKey[1]);
  const res = await supabase.from('products').upsert({
    id: 99999,
    tenant_id: 'a12ba776-69a7-4712-ba53-6a5c1b68ea23', // I will just try anon without correct tenant to see syntax error
    name: 'Test',
    price: 10,
    is_active: 1
  });
  console.log(res);
}

run().catch(console.error);
