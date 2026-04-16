# Research & Insights MCP Server

Model Context Protocol server for the SoundScribe Research & Insights workspace.

## ⚠️ Security Warning

**NEVER commit your `.env` file or expose your service role key.**

The `SUPABASE_SERVICE_ROLE_KEY` grants admin access to your database. Treat it like a master password:

✅ **DO:** Store in `.env` (already in `.gitignore`), use environment variables, rotate if exposed  
❌ **DON'T:** Commit to git, share in Slack/email, use production keys in development

**Enable Row Level Security (RLS)** on all Supabase tables. See [SECURITY.md](SECURITY.md) for full security policy.

## Features

- **18 tools** across 4 categories:
  - Search & Retrieval (7 tools)
  - Analysis & Aggregation (5 tools)
  - Validation Workflow (4 tools)
  - Signal Export (2 tools)
- **Bulk analysis** of 1500+ calls with scoped filtering
- **API key authentication** with SHA-256 hashing
- **Rate limiting** (100 requests/minute per key)
- **Full provenance tracking** with citations and timestamps

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=production
LOG_LEVEL=info
MCP_SERVER_NAME=research-insights
MCP_SERVER_VERSION=1.0.0
```

## Register in Claude Desktop

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "research-insights": {
      "type": "stdio",
      "command": "node /absolute/path/to/mcp-research-insights/dist/index.js",
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}
```

Restart Claude Desktop.

## Tools

### Search & Retrieval

1. `search_insights_by_scope` - Bulk search with scoping (call_type, sentiment, date_range, etc.)
2. `get_collection_items` - Retrieve collection contents
3. `search_by_confidence` - Filter by confidence threshold
4. `search_by_validation_status` - Filter by validation status
5. `get_insight_provenance` - Full citation with timestamps
6. `search_recordings_metadata` - Recording-level search
7. `get_cross_workspace_insights` - Aggregate Sales/Support/UX

### Analysis & Aggregation

8. `aggregate_insights_by_theme` - Theme extraction across recordings
9. `calculate_confidence_distribution` - Quality score histogram
10. `generate_trend_analysis` - Period-over-period comparison
11. `get_competitor_mentions` - Competitive intelligence summary
12. `analyze_feature_requests` - Feature request frequency

### Validation Workflow

13. `validate_insight_batch` - Bulk validation submission
14. `get_validation_queue` - Items pending review
15. `predict_validation_outcome` - ML confidence prediction
16. `override_validation` - Manual override with reason

### Signal Export

17. `export_to_signal` - Prepare validated insights for Signal
18. `track_signal_usage` - Record usage events from Signal

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Clean dist directory
npm run clean
```

## Testing

```bash
# Validate MCP server
cd /path/to/mcp-developer
./scripts/validate-mcp.sh ../mcp-research-insights
```

## Architecture

- **Transport:** stdio (Claude Desktop integration)
- **Authentication:** API keys stored in `ux_mcp_api_keys` table
- **Rate Limiting:** PostgreSQL function `check_mcp_rate_limit()`
- **Data Sources:** `ux_analysis`, `ux_insight_validations`, `ux_collections`, `recordings`

## Security

- API keys hashed with SHA-256 (never stored plaintext)
- Rate limiting: 100 requests/minute per key
- Scopes support for permission levels
- All tool calls logged with Winston

## License

Proprietary - ECI Software Solutions
