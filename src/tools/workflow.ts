import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 23: detect_recurring_patterns
export async function detectRecurringPatterns(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    min_frequency = 3,
    pattern_types = ["pain_points", "feature_requests", "objections", "praise"],
    timeframe = "last_30_days",
    confidence_threshold = 0.75
  } = args;

  logger.info("Executing detect_recurring_patterns", { min_frequency, pattern_types, timeframe });

  try {
    // Calculate date range
    const now = new Date();
    const daysAgo = timeframe === "last_7_days" ? 7 : timeframe === "last_30_days" ? 30 : 90;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    // Fetch insights within timeframe
    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        confidence_score,
        validated_at,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          recordings(id, title, created_at)
        )
      `)
      .gte("created_at", startDate.toISOString())
      .gte("confidence_score", confidence_threshold);

    if (error) throw error;

    // Group patterns by insight type and extract recurring themes
    const patternMap = new Map<string, {
      pattern: string;
      type: string;
      frequency: number;
      examples: Array<{ quote: string; recording: string; date: string }>;
      affectedCustomers: Set<string>;
    }>();

    insights.forEach((insight: any) => {
      const analysis = insight.ux_analysis;
      if (!analysis) return;

      const summary = analysis.comprehensive_summary || "";
      const callBreakdown = analysis.call_breakdown || {};

      // Extract patterns based on type
      pattern_types.forEach((patternType: string) => {
        let patterns: string[] = [];

        switch (patternType) {
          case "pain_points":
            patterns = callBreakdown.customer_pain_points || [];
            break;
          case "feature_requests":
            patterns = callBreakdown.feature_requests || [];
            break;
          case "objections":
            patterns = callBreakdown.objections || [];
            break;
          case "praise":
            patterns = callBreakdown.positive_feedback || [];
            break;
        }

        patterns.forEach((pattern: string) => {
          const key = `${patternType}:${pattern.toLowerCase().trim()}`;

          if (!patternMap.has(key)) {
            patternMap.set(key, {
              pattern,
              type: patternType,
              frequency: 0,
              examples: [],
              affectedCustomers: new Set()
            });
          }

          const patternData = patternMap.get(key)!;
          patternData.frequency++;

          if (patternData.examples.length < 5) {
            patternData.examples.push({
              quote: summary.substring(0, 200),
              recording: analysis.recordings?.title || insight.insight_id,
              date: analysis.recordings?.created_at || insight.validated_at
            });
          }

          if (analysis.recordings?.id) {
            patternData.affectedCustomers.add(analysis.recordings.id);
          }
        });
      });
    });

    // Filter patterns meeting minimum frequency
    const recurringPatterns = Array.from(patternMap.values())
      .filter(p => p.frequency >= min_frequency)
      .map(p => ({
        ...p,
        affectedCustomers: p.affectedCustomers.size,
        customerSet: undefined // Remove Set for JSON serialization
      }))
      .sort((a, b) => b.frequency - a.frequency);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_patterns_found: recurringPatterns.length,
          timeframe,
          min_frequency,
          patterns: recurringPatterns,
          summary: {
            total_insights_analyzed: insights.length,
            top_pattern: recurringPatterns[0]?.pattern || "None",
            top_pattern_frequency: recurringPatterns[0]?.frequency || 0
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in detectRecurringPatterns", error);
    throw error;
  }
}

// Tool 21: generate_research_brief
export async function generateResearchBrief(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    scope,
    output_format = "executive",
    include_quotes = true
  } = args;

  logger.info("Executing generate_research_brief", { scope, output_format });

  try {
    // Build query with scope filters
    let query = supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        confidence_score,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          question_analysis,
          solution_recommendations,
          recordings(id, title, created_at, duration)
        )
      `);

    // Apply scope filters
    if (scope.date_range) {
      query = query
        .gte("created_at", scope.date_range.start)
        .lte("created_at", scope.date_range.end);
    }

    if (scope.call_types && scope.call_types.length > 0) {
      query = query.in("insight_type", scope.call_types);
    }

    if (scope.themes) {
      // Filter by themes in the query
    }

    const { data: insights, error } = await query;
    if (error) throw error;

    // Aggregate key findings
    const findings = {
      totalCalls: insights.length,
      callTypes: new Map(),
      topPainPoints: new Map(),
      topFeatureRequests: new Map(),
      avgDuration: 0,
      avgQualityScore: 0,
      quotes: [] as string[],
      recommendations: new Set<string>()
    };

    let totalDuration = 0;
    let totalQuality = 0;

    insights.forEach((insight: any) => {
      const analysis = insight.ux_analysis;
      if (!analysis) return;

      // Track call types
      const type = insight.insight_type;
      findings.callTypes.set(type, (findings.callTypes.get(type) || 0) + 1);

      // Extract pain points
      const painPoints = analysis.call_breakdown?.customer_pain_points || [];
      painPoints.forEach((pp: string) => {
        findings.topPainPoints.set(pp, (findings.topPainPoints.get(pp) || 0) + 1);
      });

      // Extract feature requests
      const features = analysis.call_breakdown?.feature_requests || [];
      features.forEach((fr: string) => {
        findings.topFeatureRequests.set(fr, (findings.topFeatureRequests.get(fr) || 0) + 1);
      });

      // Collect quotes
      if (include_quotes && analysis.comprehensive_summary && findings.quotes.length < 10) {
        findings.quotes.push(`"${analysis.comprehensive_summary.substring(0, 150)}..." - ${analysis.recordings?.title || 'Unknown'}`);
      }

      // Collect recommendations
      if (analysis.solution_recommendations) {
        analysis.solution_recommendations.forEach((rec: string) => findings.recommendations.add(rec));
      }

      // Track metrics
      if (analysis.recordings?.duration) {
        totalDuration += analysis.recordings.duration;
      }
      totalQuality += insight.confidence_score || 0;
    });

    findings.avgDuration = insights.length > 0 ? totalDuration / insights.length : 0;
    findings.avgQualityScore = insights.length > 0 ? totalQuality / insights.length : 0;

    // Sort and limit
    const sortedPainPoints = Array.from(findings.topPainPoints.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const sortedFeatureRequests = Array.from(findings.topFeatureRequests.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Format based on output_format
    let formattedBrief: string;

    if (output_format === "executive") {
      formattedBrief = `
# Research Brief - Executive Summary

## Overview
- **Total Calls Analyzed:** ${findings.totalCalls}
- **Average Duration:** ${Math.round(findings.avgDuration / 60)} minutes
- **Average Quality Score:** ${(findings.avgQualityScore * 100).toFixed(1)}%

## Key Findings

### Top Pain Points
${sortedPainPoints.map(([pain, count], i) => `${i + 1}. ${pain} (mentioned ${count} times)`).join('\n')}

### Top Feature Requests
${sortedFeatureRequests.map(([feature, count], i) => `${i + 1}. ${feature} (requested ${count} times)`).join('\n')}

### Recommendations
${Array.from(findings.recommendations).slice(0, 5).map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

${include_quotes ? `\n### Notable Quotes\n${findings.quotes.map(q => `- ${q}`).join('\n')}` : ''}
      `.trim();
    } else if (output_format === "detailed") {
      formattedBrief = JSON.stringify({
        overview: {
          totalCalls: findings.totalCalls,
          avgDuration: findings.avgDuration,
          avgQualityScore: findings.avgQualityScore,
          callTypeBreakdown: Object.fromEntries(findings.callTypes)
        },
        painPoints: sortedPainPoints.map(([pain, count]) => ({ pain, frequency: count })),
        featureRequests: sortedFeatureRequests.map(([feature, count]) => ({ feature, frequency: count })),
        recommendations: Array.from(findings.recommendations),
        quotes: include_quotes ? findings.quotes : []
      }, null, 2);
    } else {
      // presentation format
      formattedBrief = `
# Research Findings Presentation

## Slide 1: Overview
- ${findings.totalCalls} customer calls analyzed
- Average ${Math.round(findings.avgDuration / 60)} minute conversations
- ${(findings.avgQualityScore * 100).toFixed(1)}% quality score

## Slide 2: Top 5 Pain Points
${sortedPainPoints.slice(0, 5).map(([pain, count], i) => `${i + 1}. ${pain}`).join('\n')}

## Slide 3: Top 5 Feature Requests
${sortedFeatureRequests.slice(0, 5).map(([feature, count], i) => `${i + 1}. ${feature}`).join('\n')}

## Slide 4: Recommendations
${Array.from(findings.recommendations).slice(0, 3).map((rec, i) => `${i + 1}. ${rec}`).join('\n')}
      `.trim();
    }

    return {
      content: [{
        type: "text",
        text: formattedBrief
      }]
    };
  } catch (error) {
    logger.error("Error in generateResearchBrief", error);
    throw error;
  }
}

// Tool 19: auto_tag_recordings
export async function autoTagRecordings(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    recording_ids,
    tag_categories = ["call_type", "sentiment", "product_area", "customer_segment"],
    confidence_threshold = 0.7
  } = args;

  logger.info("Executing autoTagRecordings", { recording_ids, tag_categories });

  try {
    // Fetch recordings with transcripts and analysis
    const { data: recordings, error } = await supabase
      .from("recordings")
      .select(`
        id,
        title,
        transcript,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          question_analysis
        )
      `)
      .in("id", recording_ids);

    if (error) throw error;

    // Generate tags for each recording
    const tagSuggestions = recordings.map((recording: any) => {
      const analysis = recording.ux_analysis?.[0];
      const tags: Record<string, { value: string; confidence: number }> = {};

      // Auto-detect call_type
      if (tag_categories.includes("call_type")) {
        const callType = detectCallType(recording.title, analysis?.comprehensive_summary || "");
        tags.call_type = callType;
      }

      // Auto-detect sentiment
      if (tag_categories.includes("sentiment")) {
        const sentiment = detectSentiment(analysis?.call_breakdown || {});
        tags.sentiment = sentiment;
      }

      // Auto-detect product_area
      if (tag_categories.includes("product_area")) {
        const productArea = detectProductArea(recording.transcript || "", analysis?.comprehensive_summary || "");
        tags.product_area = productArea;
      }

      // Auto-detect customer_segment
      if (tag_categories.includes("customer_segment")) {
        const segment = detectCustomerSegment(recording.title, analysis?.comprehensive_summary || "");
        tags.customer_segment = segment;
      }

      // Filter by confidence threshold
      const filteredTags = Object.entries(tags)
        .filter(([_, tag]) => tag.confidence >= confidence_threshold)
        .reduce((acc, [category, tag]) => ({ ...acc, [category]: tag }), {});

      return {
        recording_id: recording.id,
        recording_title: recording.title,
        suggested_tags: filteredTags,
        all_tags: tags
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_recordings: recordings.length,
          tag_suggestions: tagSuggestions,
          summary: {
            avg_confidence: tagSuggestions.reduce((sum, r) => {
              const confidences = Object.values(r.suggested_tags).map((t: any) => t.confidence);
              return sum + (confidences.length > 0 ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length : 0);
            }, 0) / tagSuggestions.length
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in autoTagRecordings", error);
    throw error;
  }
}

// Helper functions for tag detection
function detectCallType(title: string, summary: string): { value: string; confidence: number } {
  const text = (title + " " + summary).toLowerCase();

  if (text.includes("discovery") || text.includes("exploratory")) {
    return { value: "discovery", confidence: 0.9 };
  } else if (text.includes("demo") || text.includes("product tour")) {
    return { value: "demo", confidence: 0.85 };
  } else if (text.includes("support") || text.includes("issue") || text.includes("bug")) {
    return { value: "support", confidence: 0.88 };
  } else if (text.includes("onboarding") || text.includes("training") || text.includes("setup")) {
    return { value: "onboarding", confidence: 0.87 };
  } else if (text.includes("usability") || text.includes("user test")) {
    return { value: "usability_test", confidence: 0.92 };
  } else if (text.includes("sales") || text.includes("pricing") || text.includes("proposal")) {
    return { value: "sales", confidence: 0.86 };
  } else if (text.includes("renewal") || text.includes("qbr") || text.includes("quarterly")) {
    return { value: "renewal", confidence: 0.84 };
  }

  return { value: "general", confidence: 0.5 };
}

function detectSentiment(callBreakdown: any): { value: string; confidence: number } {
  const painPoints = callBreakdown.customer_pain_points?.length || 0;
  const positiveFeedback = callBreakdown.positive_feedback?.length || 0;

  if (positiveFeedback > painPoints * 2) {
    return { value: "positive", confidence: 0.8 };
  } else if (painPoints > positiveFeedback * 2) {
    return { value: "negative", confidence: 0.8 };
  }

  return { value: "neutral", confidence: 0.7 };
}

function detectProductArea(transcript: string, summary: string): { value: string; confidence: number } {
  const text = (transcript + " " + summary).toLowerCase();

  const areas = [
    { name: "authentication", keywords: ["login", "sso", "auth", "sign in", "password"] },
    { name: "integrations", keywords: ["integration", "api", "webhook", "connect", "sync"] },
    { name: "reporting", keywords: ["report", "dashboard", "analytics", "metrics", "insights"] },
    { name: "onboarding", keywords: ["onboard", "getting started", "setup", "initial", "first time"] },
    { name: "billing", keywords: ["billing", "payment", "invoice", "subscription", "pricing"] },
    { name: "performance", keywords: ["slow", "fast", "performance", "speed", "latency"] }
  ];

  let bestMatch = { name: "general", confidence: 0.4 };

  areas.forEach(area => {
    const matches = area.keywords.filter(kw => text.includes(kw)).length;
    const confidence = Math.min(0.95, 0.6 + (matches * 0.15));

    if (matches > 0 && confidence > bestMatch.confidence) {
      bestMatch = { name: area.name, confidence };
    }
  });

  return { value: bestMatch.name, confidence: bestMatch.confidence };
}

function detectCustomerSegment(title: string, summary: string): { value: string; confidence: number } {
  const text = (title + " " + summary).toLowerCase();

  if (text.includes("enterprise") || text.includes("large") || text.includes("fortune")) {
    return { value: "enterprise", confidence: 0.9 };
  } else if (text.includes("smb") || text.includes("small business") || text.includes("startup")) {
    return { value: "smb", confidence: 0.88 };
  } else if (text.includes("mid-market") || text.includes("medium")) {
    return { value: "mid-market", confidence: 0.85 };
  } else if (text.includes("freemium") || text.includes("trial") || text.includes("free tier")) {
    return { value: "freemium", confidence: 0.82 };
  }

  return { value: "unknown", confidence: 0.3 };
}

// Tool 20: batch_apply_tags
export async function batchApplyTags(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    recording_ids,
    tags,
    overwrite = false
  } = args;

  logger.info("Executing batchApplyTags", { recording_ids, tags, overwrite });

  try {
    // Create or update tags table entries
    const tagOperations = recording_ids.map(async (recordingId: string) => {
      const tagData = tags.map((tag: { category: string; value: string }) => ({
        recording_id: recordingId,
        category: tag.category,
        value: tag.value,
        applied_at: new Date().toISOString()
      }));

      if (overwrite) {
        // Delete existing tags for these categories first
        await supabase
          .from("recording_tags")
          .delete()
          .eq("recording_id", recordingId)
          .in("category", tags.map((t: any) => t.category));
      }

      // Insert new tags
      return supabase
        .from("recording_tags")
        .upsert(tagData, { onConflict: "recording_id,category" });
    });

    const results = await Promise.all(tagOperations);
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_recordings: recording_ids.length,
          successful_tags: successful,
          failed_tags: failed,
          tags_applied: tags,
          overwrite_mode: overwrite
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in batchApplyTags", error);
    throw error;
  }
}
