const { createClient } = require('@supabase/supabase-js');
const url = 'https://ckkbsvetdhpltycexodp.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra2JzdmV0ZGhwbHR5Y2V4b2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjU0NjIsImV4cCI6MjA4ODM0MTQ2Mn0.xjx6Y74lsj18HqH5mI3i38bG7Q6Zp_sGTLt98DrYCIY';

async function run() {
  const res = await fetch(`${url}/rest/v1/?apikey=${key}`);
  const json = await res.json();
  const props = json.definitions.products.properties;
  const pks = [];
  for (const [k, v] of Object.entries(props)) {
    console.log(k + ': ' + v.format + ' ' + (v.description?.includes('Primary') ? '[PK]' : ''));
  }
}

run().catch(console.error);
