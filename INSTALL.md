# Research & Insights MCP Server - Installation Guide

## ✅ Prerequisites Complete
- ✅ Node.js 18+ installed
- ✅ Claude Desktop installed
- ✅ Supabase database with Phase 2 tables deployed

---

## 🚀 Installation Steps

### 1. Build the MCP Server

```bash
cd /Users/derick/mcp-research-insights-public
npm install
npm run build
```

### 2. Configure Environment Variables

Create `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
SUPABASE_URL=https://qinkldgvejheppheykfl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NODE_ENV=production
LOG_LEVEL=info
```

⚠️ **IMPORTANT:** Use your actual `SUPABASE_SERVICE_ROLE_KEY` from the main SoundScribe project.

### 3. Install MCP configuration (Claude Code / Claude plugins)

Copy the bundled MCP definition to Claude’s plugin MCP registry:

```bash
mkdir -p ~/.claude/plugins && \
cp /Users/derick/mcp-research-insights-public/claude-mcp-config.json ~/.claude/plugins/mcp-servers.json && \
echo "✅ MCP server configured!"
```

Then set your **MCP API key** (required for tool calls; generate via Supabase / your admin process). Either:

- Add `RESEARCH_INSIGHTS_MCP_API_KEY` to the `env` block in `~/.claude/plugins/mcp-servers.json`, **or**
- Export it in the shell profile you use to launch Claude.

**Note:** This file is **only** `research-insights`. If you already had other servers in `mcp-servers.json`, merge this JSON’s `research-insights` entry into that file instead of overwriting.

**Alternative — Claude Desktop plugin install:**

```bash
claude plugins install /Users/derick/mcp-research-insights-public --scope user
```

### 4. Restart Claude Desktop

Fully quit and restart Claude Desktop:
- **Mac:** Cmd+Q to quit, then relaunch
- **Windows:** Exit completely from system tray

### 5. Verify Installation

In Claude Desktop, you should see the MCP indicator (🔌) showing "research-insights" is connected.

Try a test query:
```
"Search for all insights from the last 7 days"
```

Claude should now have access to all 69 research tools!

---

## 🧪 Test Queries

Once installed, try these commands:

### Basic Search
```
"Find all discovery calls from last month"
```

### Pattern Detection
```
"What are the top 5 recurring pain points across all calls?"
```

### Stakeholder Report
```
"Create an executive summary report for Q1"
```

### Cohort Analysis
```
"Compare enterprise vs SMB customer feedback"
```

---

## 🔧 Troubleshooting

### MCP Server Not Appearing
1. Check `dist/index.js` exists: `ls -la dist/`
2. Verify environment variables in `.env`
3. Check Claude Desktop logs: `~/Library/Logs/Claude/`

### "Cannot connect to database"
- Verify `SUPABASE_URL` is correct
- Confirm `SUPABASE_SERVICE_ROLE_KEY` has admin access
- Test connection: `npm run test` (if tests exist)

### Tools Not Working
- Ensure Phase 2 migration ran successfully
- Verify tables exist in Supabase
- Check RLS policies are enabled

---

## 📊 Available Tools

With the MCP server installed, you now have access to:

- **69 total tools** across 12 categories
- **Search & Retrieval** (7 tools)
- **Workflow Automation** (4 tools)
- **Advanced Analytics** (7 tools)
- **Customer Journey** (6 tools)
- **Integrations** (4 tools)
- **AI Research Assistant** (4 tools)
- **Quality & Compliance** (4 tools)
- And more...

Full documentation: [README.md](README.md)

---

## 🔐 Security Notes

- ✅ `.env` file is in `.gitignore` (never commit)
- ✅ Service role key has full database access (keep secure)
- ✅ RLS policies protect data at row level
- ✅ API key authentication built-in

---

## 🆘 Support

- **Issues:** https://github.com/ecidk/mcp-research-insights/issues
- **Documentation:** [README.md](README.md)
- **Migration:** [supabase/migrations/](supabase/migrations/)

---

**Ready to use!** 🎉
