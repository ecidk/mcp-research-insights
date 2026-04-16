# Security Policy

## ⚠️ Security Warning

**NEVER commit your `.env` file or expose your service role key.**

The `SUPABASE_SERVICE_ROLE_KEY` grants admin access to your database. Treat it like a master password.

## Best Practices

### ✅ DO:
- Store credentials in `.env` file (already in `.gitignore`)
- Use environment variables or secret managers
- Rotate credentials immediately if exposed
- Use separate keys for dev/staging/production
- Enable Row Level Security (RLS) on all Supabase tables

### ❌ DON'T:
- Commit `.env` to git
- Share keys in Slack/email/screenshots
- Use production keys in development
- Hardcode keys in source code
- Expose keys in logs or error messages

## Reporting a Vulnerability

If you discover a security vulnerability in this MCP server, please report it by:

1. **Do NOT** open a public issue
2. Email: security@ecisolutions.com (if available)
3. Or: Create a private security advisory on GitHub

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond within 48 hours and will work with you to address the issue promptly.

## Security Features

This MCP server includes:
- API key authentication with SHA-256 hashing
- Rate limiting (100 requests/minute per key)
- Environment-based configuration (no hardcoded secrets)
- Row Level Security (RLS) compatible

## Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Model Context Protocol Security](https://modelcontextprotocol.io/docs/concepts/security)
