#!/usr/bin/env node

/**
 * Setup ux_mcp_api_keys table and generate API key
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function setup() {
  try {
    console.log('🔧 Setting up MCP API keys infrastructure...\n');

    // Step 1: Check if table exists
    console.log('1️⃣  Checking if ux_mcp_api_keys table exists...');
    const { error: checkError } = await supabase
      .from('ux_mcp_api_keys')
      .select('id')
      .limit(1);

    if (checkError && checkError.code === '42P01') {
      console.log('   ⚠️  Table does not exist. Creating...\n');

      // Create simplified table (without user_id requirement for service role)
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS ux_mcp_api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key_name TEXT NOT NULL DEFAULT 'default',
            api_key_hash TEXT UNIQUE NOT NULL,
            scopes TEXT[] DEFAULT '{"read:insights", "write:insights"}',
            is_active BOOLEAN DEFAULT true,
            expires_at TIMESTAMPTZ,
            last_used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_ux_mcp_api_keys_hash ON ux_mcp_api_keys(api_key_hash) WHERE is_active = true;

          ALTER TABLE ux_mcp_api_keys ENABLE ROW LEVEL SECURITY;

          CREATE POLICY IF NOT EXISTS "Service role full access" ON ux_mcp_api_keys
            FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
        `
      });

      if (createError) {
        console.error('   ❌ Failed to create table:', createError.message);
        console.log('\n⚠️  Please run the migration manually:');
        console.log('   supabase/migrations/20260418000003_add_mcp_api_keys.sql\n');
        process.exit(1);
      }

      console.log('   ✅ Table created successfully\n');
    } else {
      console.log('   ✅ Table already exists\n');
    }

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

    console.log('✅ Setup complete!\n');
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
    console.log('📝 Usage:');
    console.log('   Pass this key with every MCP tool call as "_apiKey" parameter\n');
    console.log('   Example MCP call:');
    console.log('   {');
    console.log('     "_apiKey": "' + apiKey + '",');
    console.log('     "scope": { "call_type": ["discovery", "demo"] }');
    console.log('   }\n');
    console.log('🔒 Security:');
    console.log('   - Key is hashed in database (SHA-256)');
    console.log('   - Rate limited to 100 requests/minute');
    console.log('   - Can be deactivated via Supabase dashboard\n');
    console.log('📋 Next Steps:');
    console.log('   1. Update mcp-research-insights/.env with Supabase credentials');
    console.log('   2. Register MCP in .mcp.json');
    console.log('   3. Restart Claude Desktop');
    console.log('   4. Test with: search_insights_by_scope tool\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

setup();
