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
import * as workflowTools from "./tools/workflow.js";
import * as alertTools from "./tools/alerts.js";
import * as reportTools from "./tools/reports.js";
import * as analyticsTools from "./tools/analytics.js";
import * as collaborationTools from "./tools/collaboration.js";
import * as integrationTools from "./tools/integrations.js";
import * as assistantTools from "./tools/assistant.js";
import * as qualityTools from "./tools/quality.js";

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
// Tool Definitions (68+ tools across 12 categories)
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

  // ========== Workflow Automation (4 tools) ==========
  {
    name: "detect_recurring_patterns",
    description: "Find patterns that appear across multiple calls (min_frequency 3+)",
    inputSchema: {
      type: "object",
      properties: {
        min_frequency: { type: "number", default: 3 },
        pattern_types: { type: "array", items: { type: "string" }, default: ["pain_points", "feature_requests", "objections", "praise"] },
        timeframe: { type: "string", default: "last_30_days" },
        confidence_threshold: { type: "number", default: 0.75 }
      }
    }
  },
  {
    name: "generate_research_brief",
    description: "Auto-generate executive briefs from multiple calls",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "object" },
        output_format: { type: "string", enum: ["executive", "detailed", "presentation"], default: "executive" },
        include_quotes: { type: "boolean", default: true }
      },
      required: ["scope"]
    }
  },
  {
    name: "auto_tag_recordings",
    description: "AI-powered auto-tagging with confidence scores",
    inputSchema: {
      type: "object",
      properties: {
        recording_ids: { type: "array", items: { type: "string" } },
        tag_categories: { type: "array", items: { type: "string" }, default: ["call_type", "sentiment", "product_area", "customer_segment"] },
        confidence_threshold: { type: "number", default: 0.7 }
      },
      required: ["recording_ids"]
    }
  },
  {
    name: "batch_apply_tags",
    description: "Bulk tag application to multiple recordings",
    inputSchema: {
      type: "object",
      properties: {
        recording_ids: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "object" } },
        overwrite: { type: "boolean", default: false }
      },
      required: ["recording_ids", "tags"]
    }
  },

  // ========== Proactive Alerts (2 tools) ==========
  {
    name: "create_research_alert",
    description: "Get notified when patterns emerge",
    inputSchema: {
      type: "object",
      properties: {
        alert_name: { type: "string" },
        conditions: { type: "object" },
        notification_channels: { type: "array", items: { type: "string" }, default: ["dashboard"] },
        recipients: { type: "array", items: { type: "string" }, default: [] }
      },
      required: ["alert_name", "conditions"]
    }
  },
  {
    name: "monitor_kpi_thresholds",
    description: "Alert when research metrics hit thresholds",
    inputSchema: {
      type: "object",
      properties: {
        kpi: { type: "string" },
        feature: { type: "string" },
        threshold: { type: "object" },
        action: { type: "string", default: "notify" }
      },
      required: ["kpi", "threshold"]
    }
  },

  // ========== Stakeholder Reports (2 tools) ==========
  {
    name: "create_stakeholder_report",
    description: "Tailored reports for product/exec/sales/engineering",
    inputSchema: {
      type: "object",
      properties: {
        audience: { type: "string", enum: ["product_team", "exec", "sales", "engineering"] },
        focus_areas: { type: "array", items: { type: "string" }, default: [] },
        time_period: { type: "string", default: "last_month" }
      },
      required: ["audience"]
    }
  },
  {
    name: "save_search_filter",
    description: "Save complex filter combinations for quick recall",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        filters: { type: "object" },
        description: { type: "string", default: "" }
      },
      required: ["name", "filters"]
    }
  },
  {
    name: "load_search_filter",
    description: "Load saved search filters",
    inputSchema: {
      type: "object",
      properties: {
        filter_id: { type: "string" },
        filter_name: { type: "string" }
      }
    }
  },

  // ========== Advanced Analytics (7 tools) ==========
  {
    name: "track_pattern_trends",
    description: "Compare patterns across time periods",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        comparison_periods: { type: "array", items: { type: "string" }, default: ["this_month", "last_month", "2_months_ago"] },
        pattern_type: { type: "string", default: "all" }
      },
      required: ["pattern"]
    }
  },
  {
    name: "compare_cohorts",
    description: "Compare insights between customer segments",
    inputSchema: {
      type: "object",
      properties: {
        cohort_a: { type: "object" },
        cohort_b: { type: "object" },
        metrics: { type: "array", items: { type: "string" }, default: ["pain_points", "feature_requests", "satisfaction", "churn_signals"] },
        date_range: { type: "object" }
      },
      required: ["cohort_a", "cohort_b"]
    }
  },
  {
    name: "track_cohort_over_time",
    description: "See how a cohort's feedback evolves",
    inputSchema: {
      type: "object",
      properties: {
        cohort: { type: "object" },
        time_buckets: { type: "string", enum: ["weekly", "monthly", "quarterly"], default: "monthly" },
        start_date: { type: "string" },
        end_date: { type: "string" }
      },
      required: ["cohort", "start_date", "end_date"]
    }
  },
  {
    name: "analyze_sentiment_shifts",
    description: "Track sentiment changes within conversations",
    inputSchema: {
      type: "object",
      properties: {
        recording_ids: { type: "array", items: { type: "string" } },
        track_by: { type: "string", default: "timeline" },
        emotion_categories: { type: "array", items: { type: "string" }, default: ["frustration", "delight", "confusion", "excitement"] }
      },
      required: ["recording_ids"]
    }
  },
  {
    name: "identify_emotional_triggers",
    description: "What causes positive/negative reactions",
    inputSchema: {
      type: "object",
      properties: {
        sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
        min_intensity: { type: "number", default: 0.7 },
        context_window: { type: "number", default: 30 }
      },
      required: ["sentiment"]
    }
  },
  {
    name: "detect_anomalies",
    description: "Find statistically unusual patterns",
    inputSchema: {
      type: "object",
      properties: {
        metrics: { type: "array", items: { type: "string" }, default: ["call_volume", "sentiment_score", "feature_mentions", "churn_signals"] },
        baseline_period: { type: "string", default: "last_90_days" },
        sensitivity: { type: "string", enum: ["high", "medium", "low"], default: "medium" }
      }
    }
  },
  {
    name: "explain_anomaly",
    description: "Understand what caused unusual patterns",
    inputSchema: {
      type: "object",
      properties: {
        anomaly_id: { type: "string" },
        context_window: { type: "number", default: 14 }
      },
      required: ["anomaly_id"]
    }
  },

  // ========== Customer Journey (6 tools) ==========
  {
    name: "map_customer_journey",
    description: "Link insights to customer journey stages",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        journey_stages: { type: "array", items: { type: "string" }, default: ["awareness", "consideration", "onboarding", "adoption", "renewal"] },
        include_timeline: { type: "boolean", default: true }
      },
      required: ["customer_id"]
    }
  },
  {
    name: "identify_journey_gaps",
    description: "Find stages with missing feedback/issues",
    inputSchema: {
      type: "object",
      properties: {
        journey_template: { type: "string", enum: ["saas_b2b", "ecommerce", "custom"], default: "saas_b2b" },
        date_range: { type: "object" }
      }
    }
  },
  {
    name: "create_insight_snapshot",
    description: "Save current analysis as reusable snapshot",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        include_filters: { type: "object" },
        share_with: { type: "array", items: { type: "string" }, default: [] },
        tags: { type: "array", items: { type: "string" }, default: [] }
      },
      required: ["title", "description"]
    }
  },
  {
    name: "search_research_history",
    description: "Find similar past research",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        timeframe: { type: "string", default: "last_12_months" },
        similarity_threshold: { type: "number", default: 0.7 }
      },
      required: ["query"]
    }
  },
  {
    name: "add_research_note",
    description: "Add contextual notes to insights",
    inputSchema: {
      type: "object",
      properties: {
        insight_id: { type: "string" },
        note_type: { type: "string", enum: ["hypothesis", "question", "observation", "action_item"] },
        content: { type: "string" },
        mention_users: { type: "array", items: { type: "string" }, default: [] }
      },
      required: ["insight_id", "note_type", "content"]
    }
  },
  {
    name: "get_team_annotations",
    description: "See what team members have noted",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "object", default: {} },
        include_unresolved_questions: { type: "boolean", default: true }
      }
    }
  },

  // ========== Integrations (4 tools) ==========
  {
    name: "sync_to_jira",
    description: "Create Jira tickets from high-frequency feature requests",
    inputSchema: {
      type: "object",
      properties: {
        feature_requests: { type: "array", items: { type: "string" } },
        project_key: { type: "string", default: "PROD" },
        issue_type: { type: "string", default: "Feature Request" },
        auto_populate: { type: "object", default: {} }
      },
      required: ["feature_requests"]
    }
  },
  {
    name: "export_to_productboard",
    description: "Send insights to ProductBoard",
    inputSchema: {
      type: "object",
      properties: {
        insights: { type: "array", items: { type: "string" } },
        board: { type: "string", default: "Feature Ideas" },
        auto_tag: { type: "boolean", default: true },
        include_provenance: { type: "boolean", default: true }
      },
      required: ["insights"]
    }
  },
  {
    name: "enrich_salesforce_account",
    description: "Add research insights to Salesforce account records",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        insight_summary: { type: "boolean", default: true },
        recent_feedback: { type: "object", default: { days: 30 } },
        risk_signals: { type: "boolean", default: true },
        expansion_opportunities: { type: "boolean", default: true }
      },
      required: ["account_id"]
    }
  },
  {
    name: "create_customer_briefing",
    description: "Generate CS briefing before renewal calls",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        briefing_type: { type: "string", enum: ["renewal", "qbr", "escalation"] },
        include_sections: { type: "array", items: { type: "string" }, default: ["sentiment_trend", "unresolved_issues", "feature_usage", "competitive_risks"] }
      },
      required: ["customer_id", "briefing_type"]
    }
  },

  // ========== AI Research Assistant (4 tools) ==========
  {
    name: "suggest_research_questions",
    description: "AI suggests follow-up questions based on data gaps",
    inputSchema: {
      type: "object",
      properties: {
        current_findings: { type: "array", items: { type: "string" } },
        research_goal: { type: "string", enum: ["understand_churn", "validate_feature", "improve_onboarding"] },
        target_audience: { type: "string", default: "enterprise" }
      },
      required: ["current_findings", "research_goal"]
    }
  },
  {
    name: "identify_knowledge_gaps",
    description: "Find what you don't know",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        compared_to: { type: "string", enum: ["industry_benchmarks", "competitor_research", "past_quarters"], default: "industry_benchmarks" }
      },
      required: ["topic"]
    }
  },
  {
    name: "test_hypothesis",
    description: "Validate research hypotheses with data",
    inputSchema: {
      type: "object",
      properties: {
        hypothesis: { type: "string" },
        null_hypothesis: { type: "string" },
        confidence_level: { type: "number", default: 0.95 },
        sample_size_min: { type: "number", default: 30 }
      },
      required: ["hypothesis", "null_hypothesis"]
    }
  },
  {
    name: "calculate_sample_size",
    description: "How many calls needed for statistical validity",
    inputSchema: {
      type: "object",
      properties: {
        effect_size: { type: "string", enum: ["small", "medium", "large"], default: "medium" },
        confidence_level: { type: "number", default: 0.95 },
        power: { type: "number", default: 0.8 }
      }
    }
  },

  // ========== Quality & Compliance (4 tools) ==========
  {
    name: "assess_research_quality",
    description: "Score research quality",
    inputSchema: {
      type: "object",
      properties: {
        recording_ids: { type: "array", items: { type: "string" } },
        criteria: { type: "array", items: { type: "string" }, default: ["sample_diversity", "question_quality", "bias_detection", "saturation_reached", "proper_documentation"] }
      },
      required: ["recording_ids"]
    }
  },
  {
    name: "detect_research_bias",
    description: "Identify leading questions, confirmation bias",
    inputSchema: {
      type: "object",
      properties: {
        recording_id: { type: "string" },
        bias_types: { type: "array", items: { type: "string" }, default: ["leading_questions", "selection_bias", "confirmation_bias"] }
      },
      required: ["recording_id"]
    }
  },
  {
    name: "audit_data_usage",
    description: "Track who accessed what insights",
    inputSchema: {
      type: "object",
      properties: {
        date_range: { type: "object" },
        user_id: { type: "string" },
        include_exports: { type: "boolean", default: true }
      },
      required: ["date_range"]
    }
  },
  {
    name: "anonymize_insights",
    description: "Remove PII before sharing",
    inputSchema: {
      type: "object",
      properties: {
        insight_ids: { type: "array", items: { type: "string" } },
        anonymization_level: { type: "string", enum: ["partial", "full"], default: "partial" },
        preserve_context: { type: "boolean", default: true }
      },
      required: ["insight_ids"]
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

      // Workflow Automation tools
      case "detect_recurring_patterns":
        return await workflowTools.detectRecurringPatterns(args, validation.scopes || []);
      case "generate_research_brief":
        return await workflowTools.generateResearchBrief(args, validation.scopes || []);
      case "auto_tag_recordings":
        return await workflowTools.autoTagRecordings(args, validation.scopes || []);
      case "batch_apply_tags":
        return await workflowTools.batchApplyTags(args, validation.scopes || []);

      // Alert tools
      case "create_research_alert":
        return await alertTools.createResearchAlert(args, validation.scopes || []);
      case "monitor_kpi_thresholds":
        return await alertTools.monitorKPIThresholds(args, validation.scopes || []);

      // Report tools
      case "create_stakeholder_report":
        return await reportTools.createStakeholderReport(args, validation.scopes || []);
      case "save_search_filter":
        return await reportTools.saveSearchFilter(args, validation.scopes || []);
      case "load_search_filter":
        return await reportTools.loadSearchFilter(args, validation.scopes || []);

      // Advanced Analytics tools
      case "track_pattern_trends":
        return await analyticsTools.trackPatternTrends(args, validation.scopes || []);
      case "compare_cohorts":
        return await analyticsTools.compareCohorts(args, validation.scopes || []);
      case "track_cohort_over_time":
        return await analyticsTools.trackCohortOverTime(args, validation.scopes || []);
      case "analyze_sentiment_shifts":
        return await analyticsTools.analyzeSentimentShifts(args, validation.scopes || []);
      case "identify_emotional_triggers":
        return await analyticsTools.identifyEmotionalTriggers(args, validation.scopes || []);
      case "detect_anomalies":
        return await analyticsTools.detectAnomalies(args, validation.scopes || []);
      case "explain_anomaly":
        return await analyticsTools.explainAnomaly(args, validation.scopes || []);

      // Customer Journey & Collaboration tools
      case "map_customer_journey":
        return await collaborationTools.mapCustomerJourney(args, validation.scopes || []);
      case "identify_journey_gaps":
        return await collaborationTools.identifyJourneyGaps(args, validation.scopes || []);
      case "create_insight_snapshot":
        return await collaborationTools.createInsightSnapshot(args, validation.scopes || []);
      case "search_research_history":
        return await collaborationTools.searchResearchHistory(args, validation.scopes || []);
      case "add_research_note":
        return await collaborationTools.addResearchNote(args, validation.scopes || []);
      case "get_team_annotations":
        return await collaborationTools.getTeamAnnotations(args, validation.scopes || []);

      // Integration tools
      case "sync_to_jira":
        return await integrationTools.syncToJira(args, validation.scopes || []);
      case "export_to_productboard":
        return await integrationTools.exportToProductBoard(args, validation.scopes || []);
      case "enrich_salesforce_account":
        return await integrationTools.enrichSalesforceAccount(args, validation.scopes || []);
      case "create_customer_briefing":
        return await integrationTools.createCustomerBriefing(args, validation.scopes || []);

      // AI Research Assistant tools
      case "suggest_research_questions":
        return await assistantTools.suggestResearchQuestions(args, validation.scopes || []);
      case "identify_knowledge_gaps":
        return await assistantTools.identifyKnowledgeGaps(args, validation.scopes || []);
      case "test_hypothesis":
        return await assistantTools.testHypothesis(args, validation.scopes || []);
      case "calculate_sample_size":
        return await assistantTools.calculateSampleSize(args, validation.scopes || []);

      // Quality & Compliance tools
      case "assess_research_quality":
        return await qualityTools.assessResearchQuality(args, validation.scopes || []);
      case "detect_research_bias":
        return await qualityTools.detectResearchBias(args, validation.scopes || []);
      case "audit_data_usage":
        return await qualityTools.auditDataUsage(args, validation.scopes || []);
      case "anonymize_insights":
        return await qualityTools.anonymizeInsights(args, validation.scopes || []);

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
    logger.info("   - Workflow Automation: 4 tools");
    logger.info("   - Proactive Alerts: 2 tools");
    logger.info("   - Stakeholder Reports: 2 tools");
    logger.info("   - Advanced Analytics: 7 tools");
    logger.info("   - Customer Journey: 6 tools");
    logger.info("   - Integrations: 4 tools");
    logger.info("   - AI Research Assistant: 4 tools");
    logger.info("   - Quality & Compliance: 4 tools");
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
