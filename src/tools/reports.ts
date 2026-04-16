import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 22: create_stakeholder_report
export async function createStakeholderReport(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    audience,
    focus_areas = [],
    time_period = "last_month"
  } = args;

  logger.info("Executing createStakeholderReport", { audience, time_period });

  try {
    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (time_period) {
      case "last_week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "last_month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "last_quarter":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Fetch insights
    const { data: insights, error} = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_type,
        confidence_score,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          solution_recommendations,
          recordings(title, created_at)
        )
      `)
      .gte("created_at", startDate.toISOString());

    if (error) throw error;

    // Tailor report based on audience
    let report: string;

    switch (audience) {
      case "product_team":
        report = generateProductTeamReport(insights, focus_areas, time_period);
        break;
      case "exec":
        report = generateExecReport(insights, time_period);
        break;
      case "sales":
        report = generateSalesReport(insights, time_period);
        break;
      case "engineering":
        report = generateEngineeringReport(insights, time_period);
        break;
      default:
        report = generateGeneralReport(insights, time_period);
    }

    return {
      content: [{
        type: "text",
        text: report
      }]
    };
  } catch (error) {
    logger.error("Error in createStakeholderReport", error);
    throw error;
  }
}

function generateProductTeamReport(insights: any[], focusAreas: string[], timePeriod: string): string {
  const featureRequests = new Map<string, number>();
  const painPoints = new Map<string, number>();
  const usabilityIssues: string[] = [];

  insights.forEach(insight => {
    const callBreakdown = insight.ux_analysis?.call_breakdown || {};

    (callBreakdown.feature_requests || []).forEach((fr: string) => {
      featureRequests.set(fr, (featureRequests.get(fr) || 0) + 1);
    });

    (callBreakdown.customer_pain_points || []).forEach((pp: string) => {
      painPoints.set(pp, (painPoints.get(pp) || 0) + 1);
    });

    if (callBreakdown.usability_issues) {
      usabilityIssues.push(...callBreakdown.usability_issues);
    }
  });

  const topFeatures = Array.from(featureRequests.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topPains = Array.from(painPoints.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return `
# Product Team Report - ${timePeriod}

## Executive Summary
- **Total Insights:** ${insights.length}
- **Feature Requests:** ${featureRequests.size} unique requests
- **Pain Points:** ${painPoints.size} unique issues
- **Usability Issues:** ${usabilityIssues.length} reported

## Top 10 Feature Requests
${topFeatures.map(([feature, count], i) => `${i + 1}. **${feature}** - ${count} customer${count > 1 ? 's' : ''}`).join('\n')}

## Top 10 Pain Points
${topPains.map(([pain, count], i) => `${i + 1}. **${pain}** - ${count} mention${count > 1 ? 's' : ''}`).join('\n')}

## Recommended Actions
${topFeatures.slice(0, 3).map(([feature], i) => `${i + 1}. Evaluate "${feature}" for roadmap inclusion`).join('\n')}
${topPains.slice(0, 2).map(([pain], i) => `${i + 4}. Address "${pain}" in next sprint`).join('\n')}

## Focus Areas
${focusAreas.length > 0 ? focusAreas.map(area => `- ${area}`).join('\n') : "No specific focus areas requested"}
  `.trim();
}

function generateExecReport(insights: any[], timePeriod: string): string {
  const totalCustomers = new Set(insights.map(i => i.ux_analysis?.recordings?.title)).size;
  const avgConfidence = insights.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / insights.length;

  const criticalIssues = insights.filter(i => {
    const painPoints = i.ux_analysis?.call_breakdown?.customer_pain_points || [];
    return painPoints.some((p: string) => p.toLowerCase().includes("critical") || p.toLowerCase().includes("urgent"));
  }).length;

  return `
# Executive Summary - ${timePeriod}

## Key Metrics
- **Customer Conversations:** ${totalCustomers}
- **Insights Generated:** ${insights.length}
- **Data Quality:** ${(avgConfidence * 100).toFixed(1)}%
- **Critical Issues:** ${criticalIssues}

## Strategic Insights
1. **Customer Satisfaction:** ${avgConfidence > 0.75 ? "High quality feedback with actionable insights" : "Mixed feedback requiring attention"}
2. **Emerging Trends:** [Analysis based on pattern detection]
3. **Risk Signals:** ${criticalIssues > 0 ? `${criticalIssues} critical issues require immediate attention` : "No critical risks identified"}

## Recommendations
- Focus on top 3 feature requests for competitive advantage
- Address critical pain points within 30 days
- Continue customer engagement at current pace
  `.trim();
}

function generateSalesReport(insights: any[], timePeriod: string): string {
  const objections = new Map<string, number>();
  const competitorMentions = new Map<string, number>();
  const successStories: string[] = [];

  insights.forEach(insight => {
    const callBreakdown = insight.ux_analysis?.call_breakdown || {};

    (callBreakdown.objections || []).forEach((obj: string) => {
      objections.set(obj, (objections.get(obj) || 0) + 1);
    });

    (callBreakdown.competitor_mentions || []).forEach((comp: string) => {
      competitorMentions.set(comp, (competitorMentions.get(comp) || 0) + 1);
    });

    if (callBreakdown.positive_feedback && callBreakdown.positive_feedback.length > 0) {
      successStories.push(callBreakdown.positive_feedback[0]);
    }
  });

  const topObjections = Array.from(objections.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topCompetitors = Array.from(competitorMentions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return `
# Sales Enablement Report - ${timePeriod}

## Common Objections
${topObjections.length > 0 ? topObjections.map(([obj, count], i) => `${i + 1}. **${obj}** - ${count} mention${count > 1 ? 's' : ''}`).join('\n') : "No significant objections recorded"}

## Competitive Landscape
${topCompetitors.length > 0 ? topCompetitors.map(([comp, count], i) => `${i + 1}. ${comp} - ${count} mention${count > 1 ? 's' : ''}`).join('\n') : "No competitor mentions recorded"}

## Success Stories
${successStories.slice(0, 3).map((story, i) => `${i + 1}. "${story}"`).join('\n\n')}

## Recommended Talking Points
${topObjections.slice(0, 3).map(([obj], i) => `${i + 1}. Prepare counter-narrative for "${obj}"`).join('\n')}
  `.trim();
}

function generateEngineeringReport(insights: any[], timePeriod: string): string {
  const technicalIssues: string[] = [];
  const performanceComplaints: string[] = [];
  const integrationRequests: string[] = [];

  insights.forEach(insight => {
    const callBreakdown = insight.ux_analysis?.call_breakdown || {};
    const summary = insight.ux_analysis?.comprehensive_summary || "";

    if (summary.toLowerCase().includes("bug") || summary.toLowerCase().includes("error")) {
      technicalIssues.push(summary.substring(0, 100));
    }

    if (summary.toLowerCase().includes("slow") || summary.toLowerCase().includes("performance")) {
      performanceComplaints.push(summary.substring(0, 100));
    }

    if (callBreakdown.feature_requests) {
      const integrations = callBreakdown.feature_requests.filter((fr: string) =>
        fr.toLowerCase().includes("integration") || fr.toLowerCase().includes("api")
      );
      integrationRequests.push(...integrations);
    }
  });

  return `
# Engineering Report - ${timePeriod}

## Technical Issues
${technicalIssues.length > 0 ? technicalIssues.slice(0, 10).map((issue, i) => `${i + 1}. ${issue}...`).join('\n') : "No technical issues reported"}

## Performance Concerns
${performanceComplaints.length > 0 ? `${performanceComplaints.length} customers mentioned performance issues` : "No performance concerns"}

## Integration Requests
${integrationRequests.length > 0 ? integrationRequests.slice(0, 5).map((req, i) => `${i + 1}. ${req}`).join('\n') : "No integration requests"}

## Recommended Actions
1. Prioritize bugs mentioned in ${technicalIssues.length > 3 ? "3+" : technicalIssues.length} calls
2. Investigate performance in [specific areas]
3. Evaluate top integration requests for Q${Math.ceil((new Date().getMonth() + 1) / 3)} roadmap
  `.trim();
}

function generateGeneralReport(insights: any[], timePeriod: string): string {
  return `
# Research Report - ${timePeriod}

## Overview
- Total insights analyzed: ${insights.length}
- Average confidence score: ${(insights.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / insights.length * 100).toFixed(1)}%

## Key Findings
[General analysis of insights]

## Next Steps
[Recommended actions based on findings]
  `.trim();
}

// Tool 51: save_search_filter
export async function saveSearchFilter(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { name, filters, description = "" } = args;

  logger.info("Executing saveSearchFilter", { name });

  try {
    const { data, error } = await supabase
      .from("saved_search_filters")
      .insert({
        name,
        filters,
        description,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          filter_id: data.id,
          name: data.name,
          filters: data.filters,
          message: `Search filter "${name}" saved successfully`
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in saveSearchFilter", error);
    throw error;
  }
}

// Tool: load_search_filter
export async function loadSearchFilter(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { filter_id = null, filter_name = null } = args;

  logger.info("Executing loadSearchFilter", { filter_id, filter_name });

  try {
    let query = supabase.from("saved_search_filters").select("*");

    if (filter_id) {
      query = query.eq("id", filter_id);
    } else if (filter_name) {
      query = query.eq("name", filter_name);
    } else {
      // Return all saved filters
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          filters: data,
          total: data.length
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in loadSearchFilter", error);
    throw error;
  }
}
