#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Service Role Key exists:', !!supabaseServiceRoleKey);

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkTable() {
  console.log('\n🔍 Checking if ux_mcp_api_keys table exists...\n');

  const { data, error } = await supabase
    .from('ux_mcp_api_keys')
    .select('*')
    .limit(1);

  console.log('Data:', data);
  console.log('Error:', error);

  if (error) {
    console.log('\n❌ Table does not exist or cannot be accessed');
    console.log('Error details:', JSON.stringify(error, null, 2));
  } else {
    console.log('\n✅ Table exists and is accessible');
    console.log('Current rows:', data.length);
  }
}

checkTable();
