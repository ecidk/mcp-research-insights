# Research & Insights MCP Server - Deployment Guide

## 🎯 Recommended Approach: GitHub Packages (NPM)

**Why this is best for your company:**
- ✅ Free with GitHub (private packages included)
- ✅ Works with existing GitHub authentication
- ✅ Easy for users: `npx @eci-soundscribe/mcp-research-insights`
- ✅ Version management built-in
- ✅ No infrastructure to maintain

---

## 📦 Option 1: Publish to GitHub Packages (Recommended)

### Step 1: Prepare Repository

```bash
# Navigate to project
cd /Users/derick/Documents/GitHub/ECI-SoundScribe

# Check git status
git status

# Add MCP server files
git add mcp-research-insights/
git add mcp-developer/

# Commit
git commit -m "feat: Add Research & Insights MCP server with mcp-developer skill

- 18 tools for bulk analysis (search, analysis, validation, export)
- API key authentication with SHA-256 hashing
- Rate limiting (100 req/min)
- mcp-developer.skill for future MCP development
- Complete documentation and setup guides"

# Push to GitHub
git push origin main
```

### Step 2: Configure GitHub Package Permissions

1. Go to: https://github.com/your-org/soundscribe/settings/actions
2. Under "Workflow permissions", enable:
   - ✅ Read and write permissions
   - ✅ Allow GitHub Actions to create and approve pull requests

### Step 3: Create GitHub Personal Access Token

**For Publishing:**
1. Go to: https://github.com/settings/tokens/new
2. Select scopes:
   - ✅ `write:packages`
   - ✅ `read:packages`
   - ✅ `delete:packages`
3. Name: "MCP Research Insights Publisher"
4. Generate token and save it

**Set up authentication:**
```bash
# Create .npmrc in your home directory
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" > ~/.npmrc
echo "@eci-soundscribe:registry=https://npm.pkg.github.com" >> ~/.npmrc
```

### Step 4: Publish Package

```bash
cd /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights

# Build
npm run build

# Login to GitHub Packages
npm login --registry=https://npm.pkg.github.com

# Publish
npm publish
```

**Expected output:**
```
+ @eci-soundscribe/mcp-research-insights@1.0.0
✨  Done in 2.5s
```

### Step 5: Users Install Package

**Users need to:**

1. **Authenticate with GitHub Packages:**
   ```bash
   npm login --registry=https://npm.pkg.github.com
   # Username: their GitHub username
   # Password: their GitHub Personal Access Token (with read:packages scope)
   ```

2. **Add to .mcp.json:**
   ```json
   {
     "mcpServers": {
       "research-insights": {
         "type": "stdio",
         "command": "npx @eci-soundscribe/mcp-research-insights",
         "env": {
           "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
           "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
         }
       }
     }
   }
   ```

3. **Set environment variable:**
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   ```

4. **Restart Claude Desktop**

---

## 🔄 Option 2: Direct GitHub Repository Access (Simpler)

**Best for:** Quick rollout, small team, developers

### Users Install from GitHub

```bash
# Clone repository
git clone https://github.com/your-org/soundscribe.git
cd soundscribe/mcp-research-insights

# Install dependencies and build
npm install
npm run build
```

### Users Configure .mcp.json

```json
{
  "mcpServers": {
    "research-insights": {
      "type": "stdio",
      "command": "node /absolute/path/to/soundscribe/mcp-research-insights/dist/index.js",
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}
```

**Pros:**
- ✅ No NPM registry needed
- ✅ Users can see source code
- ✅ Easy updates with `git pull`

**Cons:**
- ❌ Users must build locally
- ❌ Path management more complex
- ❌ No version pinning

---

## 🐳 Option 3: Docker (For Advanced Users)

### Create Dockerfile

```bash
cd /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights
```

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy built dist
COPY dist/ ./dist/

# Set environment
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

### Build and Push

```bash
# Build image
docker build -t ghcr.io/your-org/mcp-research-insights:1.0.0 .

# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Push
docker push ghcr.io/your-org/mcp-research-insights:1.0.0
```

### Users Run Container

```bash
docker run -d \
  -e SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="..." \
  --name mcp-research-insights \
  ghcr.io/your-org/mcp-research-insights:1.0.0
```

---

## 🔐 API Key Distribution Strategy

### Recommended: Individual API Keys

**Script for users to generate their own keys:**

1. Share this command in onboarding docs:
   ```bash
   # Clone repo (if using GitHub directly)
   git clone https://github.com/your-org/soundscribe.git
   cd soundscribe/mcp-research-insights
   
   # Generate personal API key
   node scripts/apply-migration-and-generate-key.js
   ```

2. User saves their unique API key

3. User adds to environment:
   ```bash
   export MCP_RESEARCH_INSIGHTS_API_KEY="mcp_key_..."
   ```

### Alternative: Shared Team Keys

**Create team keys:**

```bash
# Research team key
node scripts/apply-migration-and-generate-key.js
# Save as: MCP_KEY_RESEARCH_TEAM

# Product team key
node scripts/apply-migration-and-generate-key.js
# Save as: MCP_KEY_PRODUCT_TEAM

# Executive team key
node scripts/apply-migration-and-generate-key.js
# Save as: MCP_KEY_EXECUTIVE_TEAM
```

**Share via:**
- 1Password (recommended)
- AWS Secrets Manager
- Slack DM (less secure)

---

## 📚 User Onboarding Package

### Create Company Wiki Page

**Template:**

```markdown
# Research & Insights MCP Server - Quick Start

## What is this?
An MCP server that gives Claude Desktop access to 18 powerful tools for analyzing 1500+ research calls.

## Installation (5 minutes)

### Option A: NPM (Easiest)
1. Authenticate: `npm login --registry=https://npm.pkg.github.com`
2. Add to .mcp.json (see below)
3. Set SUPABASE_SERVICE_ROLE_KEY environment variable
4. Restart Claude Desktop

### Option B: From Source
1. Clone: `git clone https://github.com/your-org/soundscribe.git`
2. Build: `cd soundscribe/mcp-research-insights && npm install && npm run build`
3. Add to .mcp.json with absolute path
4. Restart Claude Desktop

## Configuration

Add to `~/.claude/config/.mcp.json`:
\`\`\`json
{
  "mcpServers": {
    "research-insights": {
      "type": "stdio",
      "command": "npx @eci-soundscribe/mcp-research-insights",
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}
\`\`\`

Set environment variable:
\`\`\`bash
# Add to ~/.zshrc or ~/.bashrc
export SUPABASE_SERVICE_ROLE_KEY="[Get from 1Password: 'MCP Service Role Key']"
\`\`\`

## Get Your API Key

Run this command:
\`\`\`bash
npx @eci-soundscribe/mcp-research-insights generate-key
\`\`\`

Save the key in your password manager.

## Example Queries

[Include the 2 prompts from earlier]

## Support
- Slack: #mcp-research-insights
- GitHub Issues: https://github.com/your-org/soundscribe/issues
- Office Hours: Fridays 2-3pm PT
```

---

## 🚀 Rollout Plan

### Week 1: Alpha Testing (5 users)
**Audience:** Kelsie's research team

**Actions:**
1. Share GitHub repo access
2. Manual installation support
3. Collect feedback on:
   - Installation process
   - Tool performance
   - Missing features

**Deliverables:**
- ✅ 5 successful installations
- ✅ Feedback document
- ✅ Bug fixes deployed

### Week 2: Beta Testing (20 users)
**Audience:** Research + Product teams

**Actions:**
1. Publish to GitHub Packages
2. Create onboarding wiki page
3. Announce in #general Slack
4. Host onboarding session

**Deliverables:**
- ✅ NPM package published
- ✅ 20 successful installations
- ✅ User guide finalized

### Month 2: General Availability
**Audience:** All employees

**Actions:**
1. Company-wide announcement
2. Create support channel (#mcp-research-insights)
3. Weekly office hours
4. Usage analytics dashboard

**Deliverables:**
- ✅ 100+ active users
- ✅ Usage metrics tracked
- ✅ Support process established

---

## 📊 Success Metrics

Track in Supabase:

```sql
-- Create analytics table
CREATE TABLE mcp_usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT,
  tool_name TEXT,
  execution_time_ms INTEGER,
  success BOOLEAN,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly active users
SELECT COUNT(DISTINCT user_email) 
FROM mcp_usage_analytics 
WHERE timestamp > NOW() - INTERVAL '7 days';

-- Most used tools
SELECT tool_name, COUNT(*) as usage_count
FROM mcp_usage_analytics
GROUP BY tool_name
ORDER BY usage_count DESC
LIMIT 10;
```

---

## 🔧 Maintenance & Updates

### Publishing Updates

```bash
cd /Users/derick/Documents/GitHub/ECI-SoundScribe/mcp-research-insights

# Update version in package.json
npm version patch  # 1.0.0 -> 1.0.1 (bug fixes)
npm version minor  # 1.0.0 -> 1.1.0 (new features)
npm version major  # 1.0.0 -> 2.0.0 (breaking changes)

# Build and publish
npm run build
npm publish
```

### User Updates

**For NPM users:**
```bash
# Auto-updates with npx (always uses latest)
npx @eci-soundscribe/mcp-research-insights

# Or pin to version
npx @eci-soundscribe/mcp-research-insights@1.0.0
```

**For GitHub users:**
```bash
cd soundscribe/mcp-research-insights
git pull
npm install
npm run build
```

---

## 📞 Support Structure

### Create Support Channels

1. **Slack Channel: #mcp-research-insights**
   - General questions
   - Feature requests
   - Quick help

2. **GitHub Issues**
   - Bug reports
   - Feature requests
   - Technical issues

3. **Office Hours**
   - Weekly 1-hour session
   - Demo new features
   - Q&A

4. **Documentation**
   - Internal wiki
   - Video tutorials
   - FAQ

---

## 🎓 Training Materials

### Create These Resources:

1. **5-Minute Installation Video**
   - Screen recording of setup process
   - Common pitfalls and solutions

2. **Example Query Library**
   - 10-20 pre-written prompts
   - Cover all 18 tools
   - Real use cases

3. **Troubleshooting Guide**
   - Common errors and fixes
   - How to check logs
   - When to ask for help

4. **Best Practices Document**
   - Efficient query patterns
   - Rate limit management
   - Security guidelines

---

## ✅ Immediate Next Steps

### For You (Admin/Maintainer):

1. **Push to GitHub** (if not already done)
   ```bash
   git add mcp-research-insights/ mcp-developer/
   git commit -m "feat: Add Research & Insights MCP server"
   git push
   ```

2. **Choose distribution method:**
   - ✅ Recommended: GitHub Packages (NPM)
   - ⭐ Easiest: Direct GitHub access

3. **Create onboarding wiki page**
   - Use template above
   - Add to company wiki/Notion/Confluence

4. **Test with 1-2 users**
   - Validate installation process
   - Fix any issues

5. **Announce to Kelsie's team**
   - Share installation guide
   - Offer installation support

### For Users:

1. **Get access** to GitHub repo
2. **Follow installation guide** from wiki
3. **Generate API key**
4. **Test with example queries**
5. **Join** #mcp-research-insights Slack channel

---

**Bottom Line:** I recommend starting with **GitHub direct access** for Kelsie's team (Week 1), then publishing to **GitHub Packages** for wider rollout (Week 2+). This gives you time to iron out issues before company-wide deployment.

Would you like me to help with any of these steps?
