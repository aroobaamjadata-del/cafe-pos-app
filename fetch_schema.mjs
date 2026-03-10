import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supaStr = fs.readFileSync('./electron/supabase.ts', 'utf8');
const matchUrl = supaStr.match(/const SUPABASE_URL = '(.*?)'/);
const matchKey = supaStr.match(/const SUPABASE_ANON_KEY = '(.*?)'/);

const supabase = createClient(matchUrl[1], matchKey[1]);
const { data, error } = await supabase.from('products').select('*').limit(1);
console.log('DATA:', data);
console.log('ERROR:', error);
