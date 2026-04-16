#!/usr/bin/env node

/**
 * Apply migration and generate MCP API key using Supabase Management API
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

async function applyMigrationAndGenerateKey() {
  try {
    console.log('🔧 Setting up MCP API keys infrastructure...\n');

    // Step 1: Check if table exists
    console.log('1️⃣  Checking if ux_mcp_api_keys table exists...');
    const { error: checkError } = await supabase
      .from('ux_mcp_api_keys')
      .select('id')
      .limit(1);

    if (checkError && checkError.code === '42P01') {
      console.log('   ⚠️  Table does not exist.\n');
      console.log('   Please run this SQL in Supabase SQL Editor:');
      console.log('   → Open: https://supabase.com/dashboard/project/YOUR-PROJECT/sql/new');
      console.log('   → Copy SQL from: mcp-research-insights/scripts/create-simple-table.sql\n');
      console.log('   Or run in your terminal:');
      console.log('   cat mcp-research-insights/scripts/create-simple-table.sql\n');

      const sqlPath = join(__dirname, 'create-simple-table.sql');
      const sql = readFileSync(sqlPath, 'utf-8');

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('SQL TO RUN:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(sql);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('After running the SQL, run this script again to generate the API key.\n');
      process.exit(0);
    }

    console.log('   ✅ Table exists\n');

    // Step 2: Generate API key
    console.log('2️⃣  Generating new MCP API key...\n');

    const randomBytes = crypto.randomBytes(32);
    const apiKey = `mcp_key_${randomBytes.toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const { data, error } = await supabase
      .from('ux_mcp_api_keys')
      .insert({
        key_name: 'research-insights-mcp',
        api_key_hash: keyHash,
        scopes: ['read:insights', 'write:insights', 'read:collections', 'export:signal'],
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('❌ Failed to insert API key:', error);
      process.exit(1);
    }

    console.log('✅ API key generated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 API KEY (save this - it will not be shown again):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   ${apiKey}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Key Details:');
    console.log(`   ID: ${data[0].id}`);
    console.log(`   Name: ${data[0].key_name}`);
    console.log(`   Hash: ${keyHash.substring(0, 16)}...`);
    console.log(`   Scopes: ${data[0].scopes.join(', ')}`);
    console.log(`   Active: ${data[0].is_active}`);
    console.log(`   Created: ${data[0].created_at}\n`);
    console.log('📝 Next Steps:');
    console.log('   1. Update mcp-research-insights/.env:');
    console.log(`      SUPABASE_URL=${supabaseUrl}`);
    console.log('      SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>');
    console.log('');
    console.log('   2. Register in .mcp.json:');
    console.log('      {');
    console.log('        "mcpServers": {');
    console.log('          "research-insights": {');
    console.log('            "type": "stdio",');
    console.log('            "command": "node ' + join(__dirname, '../dist/index.js').replace(/\\/g, '/') + '",');
    console.log('            "env": {');
    console.log(`              "SUPABASE_URL": "${supabaseUrl}",`);
    console.log('              "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"');
    console.log('            }');
    console.log('          }');
    console.log('        }');
    console.log('      }');
    console.log('');
    console.log('   3. Restart Claude Desktop\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigrationAndGenerateKey();
