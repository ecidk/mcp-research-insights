# Research & Insights MCP Server

**Supercharge Claude Desktop with bulk analysis of 1500+ user research calls, validation workflows, and Signal export capabilities.**

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects Claude Desktop to your Supabase-backed research repository, enabling AI-powered analysis of customer calls, user interviews, and support conversations at scale.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](package.json)
[![MCP](https://img.shields.io/badge/MCP-1.0.4-purple.svg)](https://modelcontextprotocol.io)

---

## 🎯 What This Does

This MCP server gives Claude Desktop **direct access to your user research database**, enabling you to:

- 🔍 **Search across 1500+ calls** with natural language queries
- 📊 **Aggregate insights by theme** across multiple recordings
- ✅ **Validate research findings** with ML-powered confidence scoring
- 📈 **Track trends over time** (week-over-week, month-over-month)
- 🎯 **Extract competitive intelligence** from customer conversations
- 📦 **Export to Signal** for cross-functional sharing

Instead of manually reviewing hundreds of calls, ask Claude:
> *"What are the top 5 pain points mentioned in discovery calls this month?"*

> *"Show me all feature requests from enterprise customers with high confidence scores"*

> *"Which competitors are mentioned most frequently, and in what context?"*

Claude can now answer these questions by directly querying your research database.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** installed
- **Claude Desktop** ([download here](https://claude.ai/download))
- **Supabase project** with research data (see [Database Setup](#database-setup))

### 1. Install

```bash
git clone https://github.com/ecidk/mcp-research-insights.git
cd mcp-research-insights
npm install
npm run build
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NODE_ENV=production
LOG_LEVEL=info
```

### 3. Register with Claude Desktop

Add to `~/.claude/mcp.json` (create if it doesn't exist):

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

**💡 Tip:** Use environment variable substitution (`${SUPABASE_SERVICE_ROLE_KEY}`) to avoid hardcoding secrets.

### 4. Restart Claude Desktop

The MCP server will auto-start when Claude Desktop launches. Look for the 🔌 indicator showing "research-insights" is connected.

---

## 💬 Example Conversations

Once connected, you can have conversations like:

**You:** *"Search for all discovery calls from the last 30 days where customers mentioned pricing concerns"*

**Claude:** *Uses `search_insights_by_scope` with filters: `call_type=discovery`, `date_range=last_30_days`, `sentiment=negative`, `keywords=pricing`*

---

**You:** *"What are the most common feature requests from enterprise customers?"*

**Claude:** *Uses `analyze_feature_requests` filtered by customer segment, then `aggregate_insights_by_theme` to cluster similar requests*

---

**You:** *"Show me the validation queue and predict which insights are likely to be approved"*

**Claude:** *Calls `get_validation_queue` then `predict_validation_outcome` for each item, providing confidence scores*

---

## 🛠️ 18 Available Tools

### 🔍 Search & Retrieval (7 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `search_insights_by_scope` | Bulk search with complex filtering | *"Find all pain points from Q1 with high confidence"* |
| `get_collection_items` | Retrieve curated collections | *"Show me the 'Onboarding Issues' collection"* |
| `search_by_confidence` | Filter by AI confidence scores | *"Only show insights with >80% confidence"* |
| `search_by_validation_status` | Filter by validation state | *"What's pending review?"* |
| `get_insight_provenance` | Full citation with timestamps | *"Where did this insight come from?"* |
| `search_recordings_metadata` | Recording-level search | *"Find calls with [customer_name]"* |
| `get_cross_workspace_insights` | Aggregate Sales/Support/UX | *"Compare support vs sales feedback"* |

### 📊 Analysis & Aggregation (5 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `aggregate_insights_by_theme` | Theme extraction across calls | *"Cluster similar pain points"* |
| `calculate_confidence_distribution` | Quality score histogram | *"What's our data quality like?"* |
| `generate_trend_analysis` | Period-over-period comparison | *"How did feedback change month-over-month?"* |
| `get_competitor_mentions` | Competitive intelligence | *"Which competitors are customers evaluating?"* |
| `analyze_feature_requests` | Feature request frequency | *"Top 10 most requested features"* |

### ✅ Validation Workflow (4 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `validate_insight_batch` | Bulk approve/reject insights | *"Validate these 50 insights"* |
| `get_validation_queue` | Items pending review | *"What needs review?"* |
| `predict_validation_outcome` | ML confidence prediction | *"Which items are likely valid?"* |
| `override_validation` | Manual override with reasoning | *"Mark as invalid due to bias"* |

### 📦 Signal Export (2 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `export_to_signal` | Prepare for external sharing | *"Export validated insights to Signal"* |
| `track_signal_usage` | Record downstream usage | *"Track when insights are viewed"* |

---

## 🗄️ Database Setup

This MCP server requires a Supabase project with the following tables:

### Core Tables

```sql
-- UX analysis results
CREATE TABLE ux_analysis (
  id UUID PRIMARY KEY,
  recording_id UUID REFERENCES recordings(id),
  call_breakdown JSONB,
  question_analysis JSONB,
  next_steps JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insight validations
CREATE TABLE ux_insight_validations (
  id UUID PRIMARY KEY,
  insight_id UUID,
  insight_type TEXT,
  validation_status TEXT, -- validated, needs_review, rejected
  confidence_score FLOAT,
  reason_codes TEXT[],
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collections (curated groups)
CREATE TABLE ux_collections (
  id UUID PRIMARY KEY,
  name TEXT,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collection items (many-to-many)
CREATE TABLE ux_collection_items (
  collection_id UUID REFERENCES ux_collections(id),
  insight_id UUID,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, insight_id)
);

-- Recordings metadata
CREATE TABLE recordings (
  id UUID PRIMARY KEY,
  title TEXT,
  duration INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  content_type TEXT -- 'user_experience', 'sales_call', 'customer_support'
);
```

### Required Views

```sql
-- Validation queue view
CREATE VIEW ux_validation_queue AS
SELECT 
  v.id,
  v.insight_id,
  v.insight_type,
  v.confidence_score,
  v.validation_status,
  v.created_at,
  a.call_breakdown->>'summary' AS insight_context
FROM ux_insight_validations v
LEFT JOIN ux_analysis a ON v.insight_id = a.recording_id
WHERE v.validation_status = 'needs_review'
ORDER BY v.confidence_score ASC, v.created_at ASC;
```

### Optional: API Key Authentication

```sql
-- MCP API keys (hashed)
CREATE TABLE ux_mcp_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  description TEXT,
  scopes TEXT[] DEFAULT ARRAY['read'],
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limiting function
CREATE OR REPLACE FUNCTION check_mcp_rate_limit(
  p_key_hash TEXT,
  p_limit INTEGER DEFAULT 100
) RETURNS BOOLEAN AS $$
  -- Implementation: check if key_hash has exceeded p_limit requests in last minute
$$ LANGUAGE plpgsql;
```

**💡 See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for full schema and migration scripts.**

---

## 🔐 Security Best Practices

### ⚠️ Critical: Never Expose Your Service Role Key

The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security (RLS) and grants **full admin access** to your database.

### ✅ Do This:

- ✅ Store in `.env` file (already in `.gitignore`)
- ✅ Use environment variables in production
- ✅ Rotate immediately if exposed
- ✅ Use separate keys for dev/staging/production
- ✅ Enable RLS on all tables (defense in depth)
- ✅ Monitor API usage for anomalies

### ❌ Never Do This:

- ❌ Commit `.env` to git
- ❌ Share keys in Slack, email, or screenshots
- ❌ Use production keys in development
- ❌ Hardcode keys in source code
- ❌ Expose keys in error messages or logs

### Row Level Security (RLS)

Even with the service role key, enable RLS as a safety layer:

```sql
-- Example: Users can only access their own recordings
CREATE POLICY "Users access own recordings" 
ON recordings FOR SELECT 
USING (auth.uid() = user_id);

-- Admins can access all recordings
CREATE POLICY "Admins access all recordings"
ON recordings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);
```

**📖 Full security policy:** [SECURITY.md](SECURITY.md)

---

## 🏗️ Architecture

```
┌─────────────────┐
│ Claude Desktop  │
└────────┬────────┘
         │ stdio (MCP)
         ↓
┌─────────────────────────────┐
│  Research & Insights MCP    │
│                             │
│  ┌─────────────────────┐   │
│  │  18 Tools           │   │
│  │  - Search           │   │
│  │  - Analysis         │   │
│  │  - Validation       │   │
│  │  - Export           │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │  Authentication     │   │
│  │  - API key (SHA-256)│   │
│  │  - Rate limiting    │   │
│  └─────────────────────┘   │
└─────────┬───────────────────┘
          │ Supabase Client
          ↓
┌─────────────────────────────┐
│      Supabase Project       │
│                             │
│  ┌─────────────────────┐   │
│  │  PostgreSQL         │   │
│  │  - ux_analysis      │   │
│  │  - recordings       │   │
│  │  - validations      │   │
│  │  - collections      │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │  Row Level Security │   │
│  │  (RLS Policies)     │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

### Key Design Decisions

- **Transport:** stdio (standard input/output) for Claude Desktop integration
- **Authentication:** API keys stored as SHA-256 hashes, never plaintext
- **Rate Limiting:** PostgreSQL function `check_mcp_rate_limit()` prevents abuse
- **Logging:** Winston with configurable log levels
- **Error Handling:** Graceful failures with user-friendly error messages

---

## 🧪 Testing

### Validate MCP Server

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Test server
npx @modelcontextprotocol/inspector node dist/index.js
```

### Test Tool Calls

```bash
# Start server in dev mode
npm run dev

# In another terminal, send test queries
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

---

## 📚 Documentation

- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Production deployment, Docker, environment setup
- **[SECURITY.md](SECURITY.md)** - Security policy, vulnerability reporting
- **[SETUP_COMPLETE.md](SETUP_COMPLETE.md)** - Detailed setup walkthrough

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/mcp-research-insights.git
cd mcp-research-insights

# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

---

## 🐛 Troubleshooting

### MCP Server Not Appearing in Claude Desktop

1. Check `~/.claude/mcp.json` syntax (valid JSON)
2. Verify absolute path to `dist/index.js`
3. Restart Claude Desktop completely
4. Check logs: `~/Library/Logs/Claude/mcp-research-insights.log`

### "SUPABASE_URL must be set" Error

- Ensure `.env` file exists in project root
- Verify environment variables in `mcp.json` are correct
- Check `SUPABASE_URL` format: `https://xxx.supabase.co` (no trailing slash)

### "Unauthorized" or "RLS policy violation"

- Verify `SUPABASE_SERVICE_ROLE_KEY` (not anon/public key)
- Check RLS policies allow service role access
- Confirm tables exist in `public` schema

### Rate Limit Exceeded

- Default: 100 requests/minute per API key
- Increase via `MAX_REQUESTS_PER_MINUTE` in `.env`
- Check rate limit logs: `grep "rate limit" ~/Library/Logs/Claude/mcp-research-insights.log`

---

## 📊 Use Cases

### Product Managers
- Aggregate feature requests across 1000+ customer calls
- Track sentiment trends for specific features
- Prioritize roadmap based on customer pain points

### UX Researchers
- Extract themes from user interviews at scale
- Validate research findings with confidence scores
- Export insights for cross-functional sharing

### Customer Success Teams
- Identify at-risk accounts from support call patterns
- Track product adoption challenges
- Surface competitive threats early

### Sales Teams
- Analyze objection patterns in discovery calls
- Understand why deals are won/lost
- Competitive intelligence from customer conversations

---

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io) - Official MCP documentation
- [Claude Desktop](https://claude.ai/download) - Download Claude Desktop app
- [Supabase](https://supabase.com) - Open source Firebase alternative
- [SoundScribe](https://soundscribe.ai) - AI-powered call analysis platform

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Supabase JS Client](https://github.com/supabase/supabase-js)
- [Winston Logger](https://github.com/winstonjs/winston)
- [TypeScript](https://www.typescriptlang.org/)

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/ecidk/mcp-research-insights/issues)
- **Security:** See [SECURITY.md](SECURITY.md) for reporting vulnerabilities
- **Discussions:** [GitHub Discussions](https://github.com/ecidk/mcp-research-insights/discussions)

---

**Made with ❤️ by [ECI Software Solutions](https://ecisolutions.com)**
