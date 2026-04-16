# Research & Insights MCP Server - Setup Complete! 🎉

## ✅ What's Been Created

### 1. mcp-developer Skill (Reusable MCP Development Tool)
- **Location:** `~/.claude/skills/mcp-developer.skill`
- **Purpose:** Reusable skill for creating future MCP servers
- **Contents:**
  - Complete workflow guide (SKILL.md)
  - Reference documentation (architecture, stdio, authentication)
  - Templates for new MCP servers
  - Automation scripts (scaffold, validate)

### 2. Research & Insights MCP Server
- **Location:** `/Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights/`
- **Status:** ✅ Built and validated
- **Tools:** 18 tools across 4 categories

#### Tool Categories:
**Search & Retrieval (7 tools):**
1. `search_insights_by_scope` - Bulk search with complex scoping
2. `get_collection_items` - Collection contents
3. `search_by_confidence` - Quality filtering
4. `search_by_validation_status` - Validation filtering
5. `get_insight_provenance` - Full citation
6. `search_recordings_metadata` - Recording search
7. `get_cross_workspace_insights` - Cross-workspace aggregation

**Analysis & Aggregation (5 tools):**
8. `aggregate_insights_by_theme` - Theme extraction
9. `calculate_confidence_distribution` - Quality histograms
10. `generate_trend_analysis` - Period comparison
11. `get_competitor_mentions` - Competitive intelligence
12. `analyze_feature_requests` - Feature request analysis

**Validation Workflow (4 tools):**
13. `validate_insight_batch` - Bulk validation
14. `get_validation_queue` - Pending review queue
15. `predict_validation_outcome` - ML prediction
16. `override_validation` - Manual override

**Signal Export (2 tools):**
17. `export_to_signal` - Prepare exports
18. `track_signal_usage` - Track usage events

---

## 🔑 API key (never commit real values)

Generate a key and keep it only in your local environment or secrets manager — **do not** paste production keys into this repository.

```bash
cd mcp-research-insights
node scripts/apply-migration-and-generate-key.js
```

Or create one in Supabase (table `ux_mcp_api_keys`) following your team’s process.

**Typical key metadata (example shape only):**
- **Prefix:** `mcp_key_` + random hex
- **Scopes:** e.g. `read:insights`, `write:insights`, `read:collections`, `export:signal`
- **Rate limit:** 100 requests/minute (default)

**Security:** Keys are stored as SHA-256 hashes in the database. If a key was ever committed to git, **rotate it** in Supabase (`is_active = false` on the old row, generate a new key) and purge it from git history if required by policy.

---

## 🚀 Final Setup Steps

### Step 1: Verify Environment Configuration ✅

Your `.env` file has been updated with:
```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<configured>
MCP_SERVER_NAME=research-insights
```

### Step 2: Register MCP in Claude Desktop

**Option A: Create new `.mcp.json`**
```bash
mkdir -p ~/.claude/config
cat > ~/.claude/config/.mcp.json << 'EOF'
{
  "mcpServers": {
    "research-insights": {
      "type": "stdio",
      "command": "node /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights/dist/index.js",
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}
EOF
```

**Option B: Add to existing `.mcp.json`**

Add this to your existing configuration:
```json
{
  "mcpServers": {
    "research-insights": {
      "type": "stdio",
      "command": "node /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights/dist/index.js",
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}
```

**Note:** If using `${SUPABASE_SERVICE_ROLE_KEY}`, make sure it's set in your shell environment or replace with the actual key.

### Step 3: Restart Claude Desktop

After adding the MCP configuration, **restart Claude Desktop** to load the new server.

---

## 🧪 Testing Your MCP Server

### Test 1: Check Server Availability

From Claude Desktop, ask:
```
List all available MCP servers
```

You should see `research-insights` in the list.

### Test 2: Search Insights by Scope

```
Use the research-insights MCP to search for insights with this scope:
{
  "_apiKey": "mcp_key_<paste-from-key-generation-script>",
  "scope": {
    "call_type": ["discovery", "demo"],
    "quality_threshold": 0.7
  },
  "limit": 10
}
```

### Test 3: Get Collection Items

```
Use research-insights MCP to get collection items:
{
  "_apiKey": "mcp_key_<paste-from-key-generation-script>",
  "collection_id": "<collection-uuid>",
  "include_provenance": true
}
```

### Test 4: Calculate Confidence Distribution

```
Use research-insights MCP to calculate confidence distribution:
{
  "_apiKey": "mcp_key_<paste-from-key-generation-script>",
  "bucket_size": 0.1
}
```

---

## 📊 Monitoring & Management

### View API Key in Supabase

1. Go to: https://supabase.com/dashboard/project/YOUR-PROJECT/editor
2. Select table: `ux_mcp_api_keys`
3. Find your key row by name or `api_key_prefix` (never store the full secret in git)

### Deactivate API Key

```sql
UPDATE ux_mcp_api_keys
SET is_active = false
WHERE id = '<your-ux_mcp_api_keys-row-uuid>';
```

### Check Rate Limiting

```sql
SELECT * FROM ux_mcp_rate_limits
WHERE api_key_hash = '<sha256-hex-of-your-key>';
```

### View MCP Server Logs

```bash
cd /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights
npm run dev
```

Server will output logs to console showing:
- Tool calls
- Authentication status
- Rate limit checks
- Query results

---

## 🛠️ Maintenance

### Regenerate API Key

```bash
cd /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights
node scripts/apply-migration-and-generate-key.js
```

### Update MCP Server

```bash
cd /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights
npm run build
# Restart Claude Desktop
```

### Add New Tools

1. Edit `src/tools/` files
2. Add tool definition to `src/index.ts` TOOLS array
3. Add handler case in CallToolRequestSchema handler
4. Rebuild: `npm run build`
5. Restart Claude Desktop

---

## 📚 Documentation

- **Main README:** `mcp-research-insights/README.md`
- **Skill Guide:** `mcp-developer/SKILL.md`
- **Architecture Reference:** `mcp-developer/references/architecture.md`
- **Authentication Guide:** `mcp-developer/references/authentication.md`

---

## 🎯 Success Metrics

- ✅ **Phase A Complete:** mcp-developer.skill created and installed
- ✅ **Phase B Complete:** Research & Insights MCP server implemented
- ✅ **18 Tools:** All tools implemented and tested
- ✅ **TypeScript Build:** Successful
- ✅ **Validation:** Passed all checks
- ✅ **Database:** Tables created
- ✅ **API Key:** Generated and secured
- ✅ **Environment:** Configured

---

## 🚨 Troubleshooting

### Server not appearing in Claude Desktop

1. Check `.mcp.json` syntax (valid JSON?)
2. Verify file path is correct
3. Restart Claude Desktop
4. Check logs at `~/.claude/logs/`

### Authentication errors

1. Verify API key is correct
2. Check `ux_mcp_api_keys` table in Supabase
3. Ensure `is_active = true`
4. Check `SUPABASE_SERVICE_ROLE_KEY` is set

### Rate limit exceeded

- Wait 1 minute for rate limit window to reset
- Check `ux_mcp_rate_limits` table
- Default limit: 100 requests/minute

### Tool execution errors

1. Check TypeScript types match JSON schema
2. Verify database tables exist
3. Check Supabase credentials
4. Review server logs

---

## 📞 Support

For issues or questions:
1. Check documentation in `mcp-developer/references/`
2. Review tool implementations in `src/tools/`
3. Check server logs with `npm run dev`
4. Review Supabase database tables

---

**Implementation Date:** April 16, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
