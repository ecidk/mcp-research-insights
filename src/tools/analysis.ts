import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 8: aggregate_insights_by_theme
export async function aggregateInsightsByTheme(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { scope, theme_keywords = [] } = args;

  logger.info("Executing aggregate_insights_by_theme", { scope, theme_keywords });

  try {
    // Fetch insights with scope
    let query = supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        confidence_score,
        ux_analysis(comprehensive_summary, question_analysis)
      `);

    if (scope?.validation_status && scope.validation_status.length > 0) {
      query = query.in("validation_status", scope.validation_status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    // Simple theme grouping by insight_type
    const themeGroups: Record<string, any[]> = {};
    data.forEach(insight => {
      const theme = insight.insight_type || "uncategorized";
      if (!themeGroups[theme]) {
        themeGroups[theme] = [];
      }
      themeGroups[theme].push(insight);
    });

    const themes = Object.entries(themeGroups).map(([theme, insights]) => ({
      theme,
      count: insights.length,
      avg_confidence: insights.reduce((sum, i) => sum + i.confidence_score, 0) / insights.length,
      examples: insights.slice(0, 3)
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_insights: data.length,
          themes_found: themes.length,
          themes
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in aggregateInsightsByTheme", error);
    throw error;
  }
}

// Tool 9: calculate_confidence_distribution
export async function calculateConfidenceDistribution(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { bucket_size = 0.1 } = args;

  logger.info("Executing calculate_confidence_distribution", { bucket_size });

  try {
    const { data, error } = await supabase
      .from("ux_insight_validations")
      .select("confidence_score");

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    // Create histogram buckets
    const buckets: Record<string, number> = {};
    data.forEach(item => {
      const bucket = Math.floor(item.confidence_score / bucket_size) * bucket_size;
      const key = `${bucket.toFixed(2)}-${(bucket + bucket_size).toFixed(2)}`;
      buckets[key] = (buckets[key] || 0) + 1;
    });

    const distribution = Object.entries(buckets).map(([range, count]) => ({
      range,
      count,
      percentage: ((count / data.length) * 100).toFixed(2) + "%"
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_insights: data.length,
          bucket_size,
          distribution
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in calculateConfidenceDistribution", error);
    throw error;
  }
}

// Tool 10: generate_trend_analysis
export async function generateTrendAnalysis(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { comparison_periods, scope } = args;

  logger.info("Executing generate_trend_analysis", { comparison_periods });

  try {
    const results = await Promise.all(
      comparison_periods.map(async (period: any) => {
        let query = supabase
          .from("ux_insight_validations")
          .select("id, confidence_score, created_at")
          .gte("created_at", period.start)
          .lte("created_at", period.end);

        if (scope?.validation_status) {
          query = query.in("validation_status", scope.validation_status);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Database query failed: ${error.message}`);
        }

        const avgConfidence = data.length > 0
          ? data.reduce((sum, i) => sum + i.confidence_score, 0) / data.length
          : 0;

        return {
          period: period.name || `${period.start} to ${period.end}`,
          count: data.length,
          avg_confidence: avgConfidence
        };
      })
    );

    const trends = {
      periods: results,
      change: results.length >= 2 ? {
        count_delta: results[1].count - results[0].count,
        confidence_delta: results[1].avg_confidence - results[0].avg_confidence
      } : null
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(trends, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in generateTrendAnalysis", error);
    throw error;
  }
}

// Tool 11: get_competitor_mentions
export async function getCompetitorMentions(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { competitors = [], limit = 1000 } = args;

  logger.info("Executing get_competitor_mentions", { competitors, limit });

  try {
    const { data, error } = await supabase
      .from("ux_analysis")
      .select(`
        id,
        recording_id,
        comprehensive_summary,
        question_analysis,
        created_at,
        recordings(title)
      `)
      .limit(limit);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    // Filter for competitor mentions
    const mentions: Record<string, any[]> = {};
    competitors.forEach((comp: string) => {
      mentions[comp] = [];
    });

    data.forEach(analysis => {
      const text = (analysis.comprehensive_summary || "") + " " + (analysis.question_analysis || "");
      const recording = Array.isArray(analysis.recordings) ? analysis.recordings[0] : analysis.recordings;
      competitors.forEach((comp: string) => {
        if (text.toLowerCase().includes(comp.toLowerCase())) {
          mentions[comp].push({
            recording_id: analysis.recording_id,
            title: recording?.title,
            created_at: analysis.created_at
          });
        }
      });
    });

    const summary = Object.entries(mentions).map(([competitor, items]) => ({
      competitor,
      mention_count: items.length,
      recordings: items.slice(0, 10) // Top 10
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_analyzed: data.length,
          competitor_summary: summary
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in getCompetitorMentions", error);
    throw error;
  }
}

// Tool 12: analyze_feature_requests
export async function analyzeFeatureRequests(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { date_range, limit = 1000 } = args;

  logger.info("Executing analyze_feature_requests", { date_range, limit });

  try {
    let query = supabase
      .from("ux_analysis")
      .select(`
        id,
        recording_id,
        solution_recommendations,
        created_at,
        recordings(title)
      `)
      .limit(limit);

    if (date_range) {
      query = query
        .gte("created_at", date_range.start)
        .lte("created_at", date_range.end);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    // Count feature requests (entries with solution_recommendations)
    const featureRequests = data.filter(item =>
      item.solution_recommendations && item.solution_recommendations.length > 0
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_analyzed: data.length,
          feature_requests_found: featureRequests.length,
          frequency: ((featureRequests.length / data.length) * 100).toFixed(2) + "%",
          examples: featureRequests.slice(0, 10)
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in analyzeFeatureRequests", error);
    throw error;
  }
}
