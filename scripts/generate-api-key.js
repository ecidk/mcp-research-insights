#!/usr/bin/env node

/**
 * Generate and insert MCP API key into Supabase
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Load environment from parent .env
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load from parent directory's .env
dotenv.config({ path: join(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Make sure these are set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function generateApiKey() {
  try {
    console.log('🔑 Generating new MCP API key...\n');

    // Generate random API key
    const randomBytes = crypto.randomBytes(32);
    const apiKey = `mcp_key_${randomBytes.toString('hex')}`;

    // Hash the key for storage
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Insert into database
    const { data, error } = await supabase
      .from('ux_mcp_api_keys')
      .insert({
        api_key_hash: keyHash,
        scopes: ['read:insights', 'write:insights', 'read:collections', 'export:signal'],
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('❌ Failed to insert API key:', error);

      // Check if table exists
      if (error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
        console.error('\n⚠️  Table "ux_mcp_api_keys" does not exist.');
        console.error('   Run the migration first:');
        console.error('   supabase/migrations/20260418000003_add_mcp_api_keys.sql\n');
      }

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
    console.log(`   Hash: ${keyHash.substring(0, 16)}...`);
    console.log(`   Scopes: ${data[0].scopes.join(', ')}`);
    console.log(`   Created: ${data[0].created_at}`);
    console.log(`   Active: ${data[0].is_active}\n`);
    console.log('📝 Usage:');
    console.log('   Pass this key with every MCP tool call as "_apiKey" parameter\n');
    console.log('🔒 Security:');
    console.log('   - Key is hashed in database (SHA-256)');
    console.log('   - Rate limited to 100 requests/minute');
    console.log('   - Can be deactivated by setting is_active=false\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

generateApiKey();
