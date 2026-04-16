import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 39: sync_to_jira
export async function syncToJira(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    feature_requests,
    project_key = "PROD",
    issue_type = "Feature Request",
    auto_populate = {
      customer_count: true,
      priority_score: true,
      example_quotes: true
    }
  } = args;

  logger.info("Executing syncToJira", { feature_requests, project_key });

  try {
    const jiraTickets: any[] = [];

    for (const featureRequest of feature_requests) {
      // Fetch insights mentioning this feature
      const { data: insights, error } = await supabase
        .from("ux_insight_validations")
        .select(`
          id,
          created_at,
          ux_analysis(
            call_breakdown,
            comprehensive_summary,
            recordings(id, title, created_at)
          )
        `);

      if (error) throw error;

      // Filter insights containing this feature request
      const relevantInsights = insights.filter((insight: any) => {
        const analysis = Array.isArray(insight.ux_analysis) ? insight.ux_analysis[0] : insight.ux_analysis;
        const features = analysis?.call_breakdown?.feature_requests || [];
        return features.some((fr: string) => fr.toLowerCase().includes(featureRequest.toLowerCase()));
      });

      // Count unique customers
      const uniqueCustomers = new Set(
        relevantInsights.map((i: any) => {
          const analysis = Array.isArray(i.ux_analysis) ? i.ux_analysis[0] : i.ux_analysis;
          const recording = Array.isArray(analysis?.recordings) ? analysis.recordings[0] : analysis?.recordings;
          return recording?.id;
        })
      ).size;

      // Extract example quotes
      const exampleQuotes = relevantInsights
        .slice(0, 3)
        .map((i: any) => {
          const analysis = Array.isArray(i.ux_analysis) ? i.ux_analysis[0] : i.ux_analysis;
          const recording = Array.isArray(analysis?.recordings) ? analysis.recordings[0] : analysis?.recordings;
          return {
            customer: recording?.title || "Unknown",
            quote: analysis?.comprehensive_summary?.substring(0, 150)
          };
        });

      // Calculate priority score (based on frequency and recency)
      const priorityScore = calculatePriorityScore(relevantInsights);

      // Build Jira ticket description
      const description = `
## Feature Request: ${featureRequest}

**Customer Demand:** ${uniqueCustomers} customer${uniqueCustomers > 1 ? 's' : ''} requested this
**Priority Score:** ${priorityScore}/10
**Source:** SoundScribe Research Insights

### Customer Quotes
${exampleQuotes.map((eq, i) => `${i + 1}. "${eq.quote}..." - ${eq.customer}`).join('\n')}

### Analysis
- First mentioned: ${(() => {
  const lastInsight = relevantInsights[relevantInsights.length - 1];
  const analysis = Array.isArray(lastInsight?.ux_analysis) ? lastInsight.ux_analysis[0] : lastInsight?.ux_analysis;
  const recording = Array.isArray(analysis?.recordings) ? analysis.recordings[0] : analysis?.recordings;
  return recording?.created_at || 'Unknown';
})()}
- Most recent mention: ${(() => {
  const firstInsight = relevantInsights[0];
  const analysis = Array.isArray(firstInsight?.ux_analysis) ? firstInsight.ux_analysis[0] : firstInsight?.ux_analysis;
  const recording = Array.isArray(analysis?.recordings) ? analysis.recordings[0] : analysis?.recordings;
  return recording?.created_at || 'Unknown';
})()}
- Total mentions: ${relevantInsights.length}

### Related Insights
${relevantInsights.slice(0, 5).map((i: any) => `- [${i.id}] ${i.ux_analysis?.recordings?.title}`).join('\n')}
      `.trim();

      const jiraTicket = {
        project: project_key,
        issuetype: issue_type,
        summary: featureRequest,
        description,
        customFields: {
          customer_count: uniqueCustomers,
          priority_score: priorityScore,
          source: "research_insights"
        },
        labels: ["customer_feedback", "research", `priority_${priorityScore > 7 ? 'high' : priorityScore > 4 ? 'medium' : 'low'}`]
      };

      jiraTickets.push(jiraTicket);

      // Store integration record
      await supabase.from("integration_syncs").insert({
        integration_type: "jira",
        feature_request: featureRequest,
        external_id: null, // Will be updated after Jira creation
        sync_data: jiraTicket,
        synced_at: new Date().toISOString()
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_tickets: jiraTickets.length,
          project_key,
          tickets: jiraTickets.map(t => ({
            summary: t.summary,
            customer_count: t.customFields.customer_count,
            priority_score: t.customFields.priority_score,
            labels: t.labels
          })),
          message: `Prepared ${jiraTickets.length} Jira tickets. Next: Create via Jira API`,
          api_payload: jiraTickets[0] // Example payload for first ticket
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in syncToJira", error);
    throw error;
  }
}

// Tool 40: export_to_productboard
export async function exportToProductBoard(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    insights,
    board = "Feature Ideas",
    auto_tag = true,
    include_provenance = true
  } = args;

  logger.info("Executing exportToProductBoard", { insights, board });

  try {
    const exportItems: any[] = [];

    for (const insightId of insights) {
      const { data: insight, error } = await supabase
        .from("ux_insight_validations")
        .select(`
          id,
          insight_type,
          confidence_score,
          ux_analysis(
            comprehensive_summary,
            call_breakdown,
            solution_recommendations,
            recordings(id, title, created_at)
          )
        `)
        .eq("id", insightId)
        .single();

      if (error) throw error;

      const analysis = Array.isArray(insight.ux_analysis) ? insight.ux_analysis[0] : insight.ux_analysis;
      const breakdown = analysis?.call_breakdown || {};

      // Extract features and create ProductBoard notes
      const featureRequests = breakdown.feature_requests || [];

      featureRequests.forEach((feature: string) => {
        const recording = Array.isArray(analysis?.recordings) ? analysis.recordings[0] : analysis?.recordings;
        const pbNote = {
          title: feature,
          content: analysis?.comprehensive_summary || "",
          source: {
            type: "user_research",
            recording: recording?.title,
            date: recording?.created_at,
            insight_id: insightId
          },
          tags: auto_tag ? generateProductBoardTags(insight, feature) : [],
          user_impact: {
            frequency: breakdown.feature_requests.filter((fr: string) => fr === feature).length,
            confidence: insight.confidence_score
          },
          provenance: include_provenance ? {
            system: "SoundScribe Research Insights",
            insight_url: `/insights/${insightId}`,
            recording_id: recording?.id
          } : null
        };

        exportItems.push(pbNote);
      });
    }

    // Store export record
    await supabase.from("integration_syncs").insert({
      integration_type: "productboard",
      sync_data: { board, items: exportItems },
      synced_at: new Date().toISOString()
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_items: exportItems.length,
          board,
          items: exportItems.map(item => ({
            title: item.title,
            source: item.source.recording,
            tags: item.tags,
            impact_frequency: item.user_impact.frequency
          })),
          message: `Prepared ${exportItems.length} ProductBoard notes`,
          api_payload: exportItems[0] // Example
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in exportToProductBoard", error);
    throw error;
  }
}

// Tool 41: enrich_salesforce_account
export async function enrichSalesforceAccount(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    account_id,
    insight_summary = true,
    recent_feedback = { days: 30 },
    risk_signals = true,
    expansion_opportunities = true
  } = args;

  logger.info("Executing enrichSalesforceAccount", { account_id });

  try {
    // Fetch all insights for this account
    const recentDate = new Date(Date.now() - recent_feedback.days * 24 * 60 * 60 * 1000);

    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_type,
        confidence_score,
        created_at,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          solution_recommendations,
          recordings(title, created_at)
        )
      `)
      .gte("created_at", recentDate.toISOString());

    if (error) throw error;

    // Filter by account
    const accountInsights = insights.filter((insight: any) => {
      const title = insight.ux_analysis?.recordings?.title?.toLowerCase() || "";
      return title.includes(account_id.toLowerCase());
    });

    // Extract risk signals
    const risks: string[] = [];
    if (risk_signals) {
      accountInsights.forEach((insight: any) => {
        const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
        const breakdown = insight.ux_analysis?.call_breakdown || {};

        if (summary.includes("churn") || summary.includes("cancel") || summary.includes("competitor")) {
          risks.push(`Churn risk: ${insight.ux_analysis?.comprehensive_summary?.substring(0, 100)}`);
        }

        (breakdown.customer_pain_points || []).forEach((pain: string) => {
          if (pain.toLowerCase().includes("critical") || pain.toLowerCase().includes("blocker")) {
            risks.push(`Critical issue: ${pain}`);
          }
        });
      });
    }

    // Extract expansion opportunities
    const opportunities: string[] = [];
    if (expansion_opportunities) {
      accountInsights.forEach((insight: any) => {
        const breakdown = insight.ux_analysis?.call_breakdown || {};
        (breakdown.feature_requests || []).forEach((fr: string) => {
          if (fr.toLowerCase().includes("enterprise") || fr.toLowerCase().includes("premium")) {
            opportunities.push(fr);
          }
        });
      });
    }

    // Build enrichment data
    const enrichmentData = {
      account_id,
      last_updated: new Date().toISOString(),
      research_insights: {
        total_conversations: accountInsights.length,
        last_conversation: accountInsights[0]?.created_at,
        avg_sentiment: calculateSentiment(accountInsights),
        risk_level: risks.length > 2 ? "high" : risks.length > 0 ? "medium" : "low"
      },
      key_insights: {
        top_pain_points: extractTopItems(accountInsights, "customer_pain_points", 5),
        feature_requests: extractTopItems(accountInsights, "feature_requests", 5),
        positive_feedback: extractTopItems(accountInsights, "positive_feedback", 3)
      },
      risk_signals: {
        count: risks.length,
        details: risks.slice(0, 5)
      },
      expansion_opportunities: {
        count: opportunities.length,
        opportunities: [...new Set(opportunities)].slice(0, 5)
      },
      recent_quotes: accountInsights
        .slice(0, 3)
        .map((i: any) => {
          const analysis = Array.isArray(i.ux_analysis) ? i.ux_analysis[0] : i.ux_analysis;
          return {
            date: i.created_at,
            quote: analysis?.comprehensive_summary?.substring(0, 150)
          };
        })
    };

    // Store enrichment record
    await supabase.from("salesforce_enrichments").insert({
      account_id,
      enrichment_data: enrichmentData,
      synced_at: new Date().toISOString()
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          account_id,
          enrichment_summary: {
            conversations_analyzed: accountInsights.length,
            risk_level: enrichmentData.research_insights.risk_level,
            expansion_opportunities: enrichmentData.expansion_opportunities.count,
            data_quality: "high"
          },
          enrichment_data: enrichmentData,
          message: `Salesforce account ${account_id} enriched with ${accountInsights.length} research insights`,
          next_steps: [
            risks.length > 0 ? "Schedule retention call" : null,
            opportunities.length > 0 ? "Present expansion options" : null,
            "Update account health score"
          ].filter(Boolean)
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in enrichSalesforceAccount", error);
    throw error;
  }
}

// Tool 42: create_customer_briefing
export async function createCustomerBriefing(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    customer_id,
    briefing_type,
    include_sections = ["sentiment_trend", "unresolved_issues", "feature_usage", "competitive_risks"]
  } = args;

  logger.info("Executing createCustomerBriefing", { customer_id, briefing_type });

  try {
    // Fetch all customer insights (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        created_at,
        confidence_score,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          solution_recommendations,
          recordings(title, created_at)
        )
      `)
      .gte("created_at", ninetyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Filter by customer
    const customerInsights = insights.filter((insight: any) => {
      const title = insight.ux_analysis?.recordings?.title?.toLowerCase() || "";
      return title.includes(customer_id.toLowerCase());
    });

    // Build briefing sections
    const briefing: any = {
      customer_id,
      briefing_type,
      generated_at: new Date().toISOString(),
      sections: {}
    };

    if (include_sections.includes("sentiment_trend")) {
      briefing.sections.sentiment_trend = analyzeSentimentTrend(customerInsights);
    }

    if (include_sections.includes("unresolved_issues")) {
      briefing.sections.unresolved_issues = extractUnresolvedIssues(customerInsights);
    }

    if (include_sections.includes("feature_usage")) {
      briefing.sections.feature_usage = analyzeFeatureUsage(customerInsights);
    }

    if (include_sections.includes("competitive_risks")) {
      briefing.sections.competitive_risks = identifyCompetitiveRisks(customerInsights);
    }

    // Add briefing-specific recommendations
    if (briefing_type === "renewal") {
      briefing.recommendations = [
        briefing.sections.unresolved_issues?.issues?.length > 0
          ? `Address ${briefing.sections.unresolved_issues.issues.length} unresolved issues before renewal call`
          : "No critical blockers for renewal",
        briefing.sections.sentiment_trend?.trend === "declining"
          ? "Sentiment declining - schedule intervention call"
          : "Sentiment stable",
        briefing.sections.competitive_risks?.risks?.length > 0
          ? `Competitive threat detected: ${briefing.sections.competitive_risks.risks[0]}`
          : null
      ].filter(Boolean);
    } else if (briefing_type === "qbr") {
      briefing.recommendations = [
        "Review feature adoption progress",
        "Present roadmap for requested features",
        "Discuss expansion opportunities"
      ];
    } else if (briefing_type === "escalation") {
      briefing.recommendations = [
        "Acknowledge specific pain points immediately",
        "Commit to resolution timeline",
        "Assign executive sponsor"
      ];
    }

    // Format as executive brief
    const formattedBrief = `
# Customer Briefing: ${customer_id}
**Briefing Type:** ${briefing_type}
**Generated:** ${briefing.generated_at}

---

## Sentiment Trend (Last 90 Days)
${briefing.sections.sentiment_trend ? `
- **Overall Trend:** ${briefing.sections.sentiment_trend.trend}
- **Current Sentiment:** ${briefing.sections.sentiment_trend.current}
- **Change:** ${briefing.sections.sentiment_trend.change}
` : 'Not included'}

## Unresolved Issues
${briefing.sections.unresolved_issues ? `
**Count:** ${briefing.sections.unresolved_issues.count}

${briefing.sections.unresolved_issues.issues.slice(0, 5).map((issue: string, i: number) => `${i + 1}. ${issue}`).join('\n')}
` : 'Not included'}

## Feature Usage & Requests
${briefing.sections.feature_usage ? `
**Most Requested:** ${briefing.sections.feature_usage.top_requests[0] || 'None'}
**Usage Concerns:** ${briefing.sections.feature_usage.concerns.length}
` : 'Not included'}

## Competitive Risks
${briefing.sections.competitive_risks ? `
**Risk Level:** ${briefing.sections.competitive_risks.risk_level}
${briefing.sections.competitive_risks.risks.length > 0 ? `
**Competitors Mentioned:**
${briefing.sections.competitive_risks.risks.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}
` : 'No competitive threats detected'}
` : 'Not included'}

---

## Recommendations
${briefing.recommendations.map((rec: string, i: number) => `${i + 1}. ${rec}`).join('\n')}

---

## Recent Conversations
${customerInsights.slice(0, 3).map((insight: any, i: number) => `
### ${i + 1}. ${insight.ux_analysis?.recordings?.title}
**Date:** ${insight.created_at.split('T')[0]}
**Summary:** ${insight.ux_analysis?.comprehensive_summary?.substring(0, 150)}...
`).join('\n')}
    `.trim();

    return {
      content: [{
        type: "text",
        text: formattedBrief
      }]
    };
  } catch (error) {
    logger.error("Error in createCustomerBriefing", error);
    throw error;
  }
}

// Helper functions
function calculatePriorityScore(insights: any[]): number {
  const frequency = insights.length;
  const recency = insights[0]?.created_at
    ? (Date.now() - new Date(insights[0].created_at).getTime()) / (1000 * 60 * 60 * 24)
    : 90;

  const frequencyScore = Math.min(frequency * 1.5, 7);
  const recencyScore = recency < 7 ? 3 : recency < 30 ? 2 : 1;

  return Math.min(Math.round(frequencyScore + recencyScore), 10);
}

function generateProductBoardTags(insight: any, feature: string): string[] {
  const tags = [];

  if (insight.insight_type) tags.push(insight.insight_type);
  if (insight.confidence_score > 0.8) tags.push("high_confidence");

  const featureLower = feature.toLowerCase();
  if (featureLower.includes("integration")) tags.push("integrations");
  if (featureLower.includes("report")) tags.push("reporting");
  if (featureLower.includes("mobile")) tags.push("mobile");
  if (featureLower.includes("api")) tags.push("api");

  return tags;
}

function calculateSentiment(insights: any[]): string {
  const sentiments = insights.map(insight => {
    const breakdown = insight.ux_analysis?.call_breakdown || {};
    const positive = breakdown.positive_feedback?.length || 0;
    const negative = breakdown.customer_pain_points?.length || 0;

    if (positive > negative) return "positive";
    if (negative > positive) return "negative";
    return "neutral";
  });

  const positiveCount = sentiments.filter(s => s === "positive").length;
  const negativeCount = sentiments.filter(s => s === "negative").length;

  if (positiveCount > negativeCount * 1.5) return "positive";
  if (negativeCount > positiveCount * 1.5) return "negative";
  return "neutral";
}

function extractTopItems(insights: any[], field: string, limit: number): string[] {
  const items = new Map<string, number>();

  insights.forEach(insight => {
    const breakdown = insight.ux_analysis?.call_breakdown || {};
    const fieldItems = breakdown[field] || [];

    fieldItems.forEach((item: string) => {
      items.set(item, (items.get(item) || 0) + 1);
    });
  });

  return Array.from(items.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

function analyzeSentimentTrend(insights: any[]): any {
  const sentiments = insights.map(i => ({
    date: i.created_at,
    sentiment: calculateSentiment([i])
  }));

  const recent = sentiments.slice(0, 3);
  const older = sentiments.slice(3, 6);

  const recentPositive = recent.filter(s => s.sentiment === "positive").length;
  const olderPositive = older.filter(s => s.sentiment === "positive").length;

  return {
    trend: recentPositive > olderPositive ? "improving" : recentPositive < olderPositive ? "declining" : "stable",
    current: recent[0]?.sentiment || "neutral",
    change: recentPositive - olderPositive
  };
}

function extractUnresolvedIssues(insights: any[]): any {
  const issues: string[] = [];

  insights.forEach(insight => {
    const breakdown = insight.ux_analysis?.call_breakdown || {};
    const painPoints = breakdown.customer_pain_points || [];

    painPoints.forEach((pain: string) => {
      if (pain.toLowerCase().includes("still") || pain.toLowerCase().includes("unresolved")) {
        issues.push(pain);
      }
    });
  });

  return {
    count: issues.length,
    issues: [...new Set(issues)]
  };
}

function analyzeFeatureUsage(insights: any[]): any {
  const requests = extractTopItems(insights, "feature_requests", 5);
  const concerns: string[] = [];

  insights.forEach(insight => {
    const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
    if (summary.includes("not using") || summary.includes("underutilized")) {
      concerns.push(insight.ux_analysis?.comprehensive_summary?.substring(0, 100));
    }
  });

  return {
    top_requests: requests,
    concerns: [...new Set(concerns)]
  };
}

function identifyCompetitiveRisks(insights: any[]): any {
  const risks: string[] = [];

  insights.forEach(insight => {
    const breakdown = insight.ux_analysis?.call_breakdown || {};
    const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";

    if (summary.includes("competitor") || summary.includes("evaluating") || summary.includes("comparing")) {
      risks.push(insight.ux_analysis?.comprehensive_summary?.substring(0, 100));
    }

    (breakdown.objections || []).forEach((obj: string) => {
      if (obj.toLowerCase().includes("competitor")) {
        risks.push(obj);
      }
    });
  });

  return {
    risk_level: risks.length > 3 ? "high" : risks.length > 0 ? "medium" : "low",
    risks: [...new Set(risks)].slice(0, 5)
  };
}
