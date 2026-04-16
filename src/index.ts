#!/usr/bin/env node

/**
 * Research & Insights MCP Server
 *
 * Exposes bulk analysis capabilities for the Research & Insights workspace
 * - 18 tools across 4 categories: search, analysis, validation, export
 * - Handles 1500+ call queries with scoped filtering
 * - API key authentication + rate limiting
 *
 * @author ECI Software Solutions
 * @version 1.0.0
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { validateApiKey, checkRateLimit } from "./utils/auth.js";
import { logger } from "./utils/logger.js";
import * as searchTools from "./tools/search.js";
import * as analysisTools from "./tools/analysis.js";
import * as validationTools from "./tools/validation.js";
import * as exportTools from "./tools/export.js";

dotenv.config();

// Create MCP server
const server = new Server(
  {
    name: process.env.MCP_SERVER_NAME || "research-insights",
    version: process.env.MCP_SERVER_VERSION || "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Tool Definitions (18 tools)
// ============================================================================

const TOOLS = [
  // ========== Search & Retrieval (7 tools) ==========
  {
    name: "search_insights_by_scope",
    description: "Search insights with scoped filters (call_type, sentiment, date_range, product, segment, quality_threshold). Handles bulk queries of 1500+ calls.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "object",
          properties: {
            call_type: { type: "array", items: { type: "string" }, description: "Filter by call types" },
            sentiment: { type: "array", items: { type: "string" }, description: "Filter by sentiment" },
            date_range: {
              type: "object",
              properties: {
                start: { type: "string", format: "date" },
                end: { type: "string", format: "date" }
              }
            },
            quality_threshold: { type: "number", minimum: 0, maximum: 1 },
            validation_status: { type: "array", items: { enum: ["validated", "needs_review", "rejected"] } }
          }
        },
        limit: { type: "number", default: 1000, maximum: 5000 },
        offset: { type: "number", default: 0 }
      },
      required: ["scope"]
    }
  },
  {
    name: "get_collection_items",
    description: "Retrieve contents of a research collection",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string" },
        include_provenance: { type: "boolean", default: true }
      },
      required: ["collection_id"]
    }
  },
  {
    name: "search_by_confidence",
    description: "Filter insights by confidence score range",
    inputSchema: {
      type: "object",
      properties: {
        min_confidence: { type: "number", minimum: 0, maximum: 1, default: 0.0 },
        max_confidence: { type: "number", minimum: 0, maximum: 1, default: 1.0 },
        limit: { type: "number", default: 1000, maximum: 5000 }
      }
    }
  },
  {
    name: "search_by_validation_status",
    description: "Filter insights by validation status",
    inputSchema: {
      type: "object",
      properties: {
        validation_status: { type: "array", items: { enum: ["validated", "needs_review", "rejected"] } },
        limit: { type: "number", default: 1000 },
        offset: { type: "number", default: 0 }
      },
      required: ["validation_status"]
    }
  },
  {
    name: "get_insight_provenance",
    description: "Get full citation with timestamps and evidence",
    inputSchema: {
      type: "object",
      properties: {
        insight_id: { type: "string" }
      },
      required: ["insight_id"]
    }
  },
  {
    name: "search_recordings_metadata",
    description: "Search recordings by date range",
    inputSchema: {
      type: "object",
      properties: {
        date_range: {
          type: "object",
          properties: {
            start: { type: "string", format: "date" },
            end: { type: "string", format: "date" }
          }
        },
        limit: { type: "number", default: 1000 },
        offset: { type: "number", default: 0 }
      }
    }
  },
  {
    name: "get_cross_workspace_insights",
    description: "Aggregate insights across Sales, Support, and UX workspaces",
    inputSchema: {
      type: "object",
      properties: {
        workspace_types: { type: "array", items: { enum: ["sales", "support", "ux"] }, default: ["sales", "support", "ux"] },
        limit: { type: "number", default: 1000 }
      }
    }
  },

  // ========== Analysis & Aggregation (5 tools) ==========
  {
    name: "aggregate_insights_by_theme",
    description: "Extract and group insights by themes",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "object" },
        theme_keywords: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "calculate_confidence_distribution",
    description: "Generate quality score histogram",
    inputSchema: {
      type: "object",
      properties: {
        bucket_size: { type: "number", default: 0.1, minimum: 0.01, maximum: 1.0 }
      }
    }
  },
  {
    name: "generate_trend_analysis",
    description: "Compare insights across time periods",
    inputSchema: {
      type: "object",
      properties: {
        comparison_periods: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              start: { type: "string", format: "date" },
              end: { type: "string", format: "date" }
            },
            required: ["start", "end"]
          }
        },
        scope: { type: "object" }
      },
      required: ["comparison_periods"]
    }
  },
  {
    name: "get_competitor_mentions",
    description: "Find competitor mentions across recordings",
    inputSchema: {
      type: "object",
      properties: {
        competitors: { type: "array", items: { type: "string" } },
        limit: { type: "number", default: 1000 }
      },
      required: ["competitors"]
    }
  },
  {
    name: "analyze_feature_requests",
    description: "Extract and analyze feature request frequency",
    inputSchema: {
      type: "object",
      properties: {
        date_range: {
          type: "object",
          properties: {
            start: { type: "string", format: "date" },
            end: { type: "string", format: "date" }
          }
        },
        limit: { type: "number", default: 1000 }
      }
    }
  },

  // ========== Validation Workflow (4 tools) ==========
  {
    name: "validate_insight_batch",
    description: "Bulk validate multiple insights",
    inputSchema: {
      type: "object",
      properties: {
        insight_ids: { type: "array", items: { type: "string" } },
        validation_status: { type: "string", enum: ["validated", "needs_review", "rejected"] },
        reason_codes: { type: "array", items: { type: "string" } },
        reviewer_notes: { type: "string" }
      },
      required: ["insight_ids", "validation_status"]
    }
  },
  {
    name: "get_validation_queue",
    description: "Get insights pending manual review",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 100 },
        min_confidence: { type: "number", default: 0.0 }
      }
    }
  },
  {
    name: "predict_validation_outcome",
    description: "ML-based prediction of validation outcome",
    inputSchema: {
      type: "object",
      properties: {
        insight_id: { type: "string" }
      },
      required: ["insight_id"]
    }
  },
  {
    name: "override_validation",
    description: "Manual override of validation status",
    inputSchema: {
      type: "object",
      properties: {
        insight_id: { type: "string" },
        new_validation_status: { type: "string", enum: ["validated", "needs_review", "rejected"] },
        override_reason: { type: "string" },
        overridden_by: { type: "string" }
      },
      required: ["insight_id", "new_validation_status", "override_reason"]
    }
  },

  // ========== Signal Export (2 tools) ==========
  {
    name: "export_to_signal",
    description: "Prepare validated insights for Signal platform export",
    inputSchema: {
      type: "object",
      properties: {
        export_batch_name: { type: "string" },
        validation_status_filter: { type: "array", items: { enum: ["validated", "needs_review", "rejected"] }, default: ["validated"] }
      },
      required: ["export_batch_name"]
    }
  },
  {
    name: "track_signal_usage",
    description: "Record usage events from Signal platform",
    inputSchema: {
      type: "object",
      properties: {
        export_batch_id: { type: "string" },
        usage_event: { type: "string", enum: ["viewed", "shared", "cited", "exported"] },
        usage_details: { type: "object" }
      },
      required: ["export_batch_id", "usage_event"]
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info("Listing available tools");
  return { tools: TOOLS };
});

// ============================================================================
// Tool Handlers
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;
  const apiKey =
    (args._apiKey as string | undefined) ??
    process.env.RESEARCH_INSIGHTS_MCP_API_KEY;

  logger.info(`Tool called: ${name}`, { args: Object.keys(args) });

  // Validate API key
  const validation = await validateApiKey(apiKey ?? "");
  if (!validation.valid) {
    return {
      content: [{ type: "text", text: `Error: ${validation.error}` }],
    };
  }

  // Check rate limit
  const rateLimitOk = await checkRateLimit(validation.keyHash!);
  if (!rateLimitOk) {
    return {
      content: [{ type: "text", text: "Error: Rate limit exceeded (100 requests/minute)" }],
    };
  }

  try {
    switch (name) {
      // Search tools
      case "search_insights_by_scope":
        return await searchTools.searchInsightsByScope(args, validation.scopes || []);
      case "get_collection_items":
        return await searchTools.getCollectionItems(args, validation.scopes || []);
      case "search_by_confidence":
        return await searchTools.searchByConfidence(args, validation.scopes || []);
      case "search_by_validation_status":
        return await searchTools.searchByValidationStatus(args, validation.scopes || []);
      case "get_insight_provenance":
        return await searchTools.getInsightProvenance(args, validation.scopes || []);
      case "search_recordings_metadata":
        return await searchTools.searchRecordingsMetadata(args, validation.scopes || []);
      case "get_cross_workspace_insights":
        return await searchTools.getCrossWorkspaceInsights(args, validation.scopes || []);

      // Analysis tools
      case "aggregate_insights_by_theme":
        return await analysisTools.aggregateInsightsByTheme(args, validation.scopes || []);
      case "calculate_confidence_distribution":
        return await analysisTools.calculateConfidenceDistribution(args, validation.scopes || []);
      case "generate_trend_analysis":
        return await analysisTools.generateTrendAnalysis(args, validation.scopes || []);
      case "get_competitor_mentions":
        return await analysisTools.getCompetitorMentions(args, validation.scopes || []);
      case "analyze_feature_requests":
        return await analysisTools.analyzeFeatureRequests(args, validation.scopes || []);

      // Validation tools
      case "validate_insight_batch":
        return await validationTools.validateInsightBatch(args, validation.scopes || []);
      case "get_validation_queue":
        return await validationTools.getValidationQueue(args, validation.scopes || []);
      case "predict_validation_outcome":
        return await validationTools.predictValidationOutcome(args, validation.scopes || []);
      case "override_validation":
        return await validationTools.overrideValidation(args, validation.scopes || []);

      // Export tools
      case "export_to_signal":
        return await exportTools.exportToSignal(args, validation.scopes || []);
      case "track_signal_usage":
        return await exportTools.trackSignalUsage(args, validation.scopes || []);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Error executing tool ${name}:`, error);
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
});

// ============================================================================
// Server Initialization
// ============================================================================

async function main() {
  try {
    logger.info(`🚀 Starting ${process.env.MCP_SERVER_NAME || "Research Insights"} MCP Server...`);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("✅ MCP Server is running and ready to accept requests");
    logger.info(`📋 Available tools: ${TOOLS.length}`);
    logger.info("   - Search & Retrieval: 7 tools");
    logger.info("   - Analysis & Aggregation: 5 tools");
    logger.info("   - Validation Workflow: 4 tools");
    logger.info("   - Signal Export: 2 tools");
  } catch (error) {
    logger.error("❌ Failed to start MCP server:", error);
    process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  logger.info("🛑 Received SIGINT, shutting down gracefully...");
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("🛑 Received SIGTERM, shutting down gracefully...");
  await server.close();
  process.exit(0);
});

main();
