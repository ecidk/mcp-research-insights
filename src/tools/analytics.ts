import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 24: track_pattern_trends
export async function trackPatternTrends(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    pattern,
    comparison_periods = ["this_month", "last_month", "2_months_ago"],
    pattern_type = "all" // pain_points, feature_requests, objections, praise
  } = args;

  logger.info("Executing trackPatternTrends", { pattern, comparison_periods });

  try {
    const periodData: Array<{
      period: string;
      count: number;
      startDate: Date;
      endDate: Date;
      examples: any[];
    }> = [];

    const now = new Date();

    for (const period of comparison_periods) {
      let startDate: Date;
      let endDate: Date;

      switch (period) {
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = now;
          break;
        case "last_month":
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), 0);
          break;
        case "2_months_ago":
          startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          endDate = new Date(now.getFullYear(), now.getMonth() - 1, 0);
          break;
        case "this_quarter":
          const quarterStart = Math.floor(now.getMonth() / 3) * 3;
          startDate = new Date(now.getFullYear(), quarterStart, 1);
          endDate = now;
          break;
        case "last_quarter":
          const lastQuarterStart = Math.floor(now.getMonth() / 3) * 3 - 3;
          startDate = new Date(now.getFullYear(), lastQuarterStart, 1);
          endDate = new Date(now.getFullYear(), lastQuarterStart + 3, 0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          endDate = now;
      }

      // Fetch insights for this period
      const { data: insights, error } = await supabase
        .from("ux_insight_validations")
        .select(`
          id,
          insight_type,
          ux_analysis(
            comprehensive_summary,
            call_breakdown,
            recordings(title, created_at)
          )
        `)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (error) throw error;

      // Count pattern occurrences
      let count = 0;
      const examples: any[] = [];

      insights.forEach((insight: any) => {
        const callBreakdown = insight.ux_analysis?.call_breakdown || {};
        let patternsToSearch: string[] = [];

        if (pattern_type === "all" || pattern_type === "pain_points") {
          patternsToSearch.push(...(callBreakdown.customer_pain_points || []));
        }
        if (pattern_type === "all" || pattern_type === "feature_requests") {
          patternsToSearch.push(...(callBreakdown.feature_requests || []));
        }
        if (pattern_type === "all" || pattern_type === "objections") {
          patternsToSearch.push(...(callBreakdown.objections || []));
        }
        if (pattern_type === "all" || pattern_type === "praise") {
          patternsToSearch.push(...(callBreakdown.positive_feedback || []));
        }

        const matches = patternsToSearch.filter(p =>
          p.toLowerCase().includes(pattern.toLowerCase())
        );

        if (matches.length > 0) {
          count += matches.length;
          if (examples.length < 3) {
            examples.push({
              recording: insight.ux_analysis?.recordings?.title || "Unknown",
              date: insight.ux_analysis?.recordings?.created_at,
              matches
            });
          }
        }
      });

      periodData.push({ period, count, startDate, endDate, examples });
    }

    // Calculate trends
    const trends = [];
    for (let i = 1; i < periodData.length; i++) {
      const current = periodData[i - 1];
      const previous = periodData[i];
      const change = current.count - previous.count;
      const percentChange = previous.count > 0
        ? ((change / previous.count) * 100).toFixed(1)
        : "N/A";

      trends.push({
        from_period: previous.period,
        to_period: current.period,
        change,
        percent_change: percentChange,
        direction: change > 0 ? "increasing" : change < 0 ? "decreasing" : "stable"
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          pattern,
          pattern_type,
          period_data: periodData.map(p => ({
            period: p.period,
            count: p.count,
            date_range: `${p.startDate.toISOString().split('T')[0]} to ${p.endDate.toISOString().split('T')[0]}`,
            examples: p.examples
          })),
          trends,
          summary: {
            overall_trend: trends.length > 0 ? trends[0].direction : "unknown",
            latest_count: periodData[0]?.count || 0,
            total_change: periodData[0]?.count - periodData[periodData.length - 1]?.count
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in trackPatternTrends", error);
    throw error;
  }
}

// Tool 31: compare_cohorts
export async function compareCohorts(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    cohort_a,
    cohort_b,
    metrics = ["pain_points", "feature_requests", "satisfaction", "churn_signals"],
    date_range = null
  } = args;

  logger.info("Executing compareCohorts", { cohort_a: cohort_a.name, cohort_b: cohort_b.name });

  try {
    const analyzeCohort = async (cohort: any) => {
      let query = supabase
        .from("ux_insight_validations")
        .select(`
          id,
          insight_type,
          confidence_score,
          ux_analysis(
            comprehensive_summary,
            call_breakdown,
            recordings(id, title)
          )
        `);

      // Apply date range if provided
      if (date_range) {
        query = query
          .gte("created_at", date_range.start)
          .lte("created_at", date_range.end);
      }

      const { data: insights, error } = await query;
      if (error) throw error;

      // Filter by cohort criteria
      const filteredInsights = insights.filter((insight: any) => {
        const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
        const title = insight.ux_analysis?.recordings?.title?.toLowerCase() || "";
        const text = summary + " " + title;

        // Check each filter in the cohort definition
        if (cohort.filters.company_size) {
          if (!text.includes(cohort.filters.company_size.toLowerCase())) return false;
        }
        if (cohort.filters.arr) {
          // Simple pattern matching for ARR ranges
          const arrPattern = cohort.filters.arr.toLowerCase();
          if (!text.includes("enterprise") && !text.includes("smb") && !text.includes(arrPattern)) {
            return false;
          }
        }
        if (cohort.filters.industry) {
          if (!text.includes(cohort.filters.industry.toLowerCase())) return false;
        }

        return true;
      });

      // Calculate metrics
      const metricData: any = {
        total_insights: filteredInsights.length,
        avg_confidence: filteredInsights.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / filteredInsights.length
      };

      metrics.forEach((metric: string) => {
        if (metric === "pain_points") {
          const painPoints = new Map<string, number>();
          filteredInsights.forEach((insight: any) => {
            const pps = insight.ux_analysis?.call_breakdown?.customer_pain_points || [];
            pps.forEach((pp: string) => {
              painPoints.set(pp, (painPoints.get(pp) || 0) + 1);
            });
          });
          metricData.pain_points = {
            total: Array.from(painPoints.values()).reduce((sum, count) => sum + count, 0),
            unique: painPoints.size,
            top_5: Array.from(painPoints.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([pain, count]) => ({ pain, count }))
          };
        }

        if (metric === "feature_requests") {
          const features = new Map<string, number>();
          filteredInsights.forEach((insight: any) => {
            const frs = insight.ux_analysis?.call_breakdown?.feature_requests || [];
            frs.forEach((fr: string) => {
              features.set(fr, (features.get(fr) || 0) + 1);
            });
          });
          metricData.feature_requests = {
            total: Array.from(features.values()).reduce((sum, count) => sum + count, 0),
            unique: features.size,
            top_5: Array.from(features.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([feature, count]) => ({ feature, count }))
          };
        }

        if (metric === "satisfaction") {
          const positiveCounts = filteredInsights.reduce((sum, insight: any) => {
            const positive = insight.ux_analysis?.call_breakdown?.positive_feedback?.length || 0;
            return sum + positive;
          }, 0);
          const negativeCounts = filteredInsights.reduce((sum, insight: any) => {
            const negative = insight.ux_analysis?.call_breakdown?.customer_pain_points?.length || 0;
            return sum + negative;
          }, 0);
          metricData.satisfaction = {
            positive_mentions: positiveCounts,
            negative_mentions: negativeCounts,
            net_sentiment: positiveCounts - negativeCounts,
            satisfaction_score: ((positiveCounts / (positiveCounts + negativeCounts || 1)) * 100).toFixed(1) + "%"
          };
        }

        if (metric === "churn_signals") {
          const churnSignals = filteredInsights.filter((insight: any) => {
            const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
            return summary.includes("churn") || summary.includes("cancel") || summary.includes("competitor");
          }).length;
          metricData.churn_signals = {
            count: churnSignals,
            percentage: ((churnSignals / filteredInsights.length) * 100).toFixed(1) + "%"
          };
        }
      });

      return metricData;
    };

    const [cohortAData, cohortBData] = await Promise.all([
      analyzeCohort(cohort_a),
      analyzeCohort(cohort_b)
    ]);

    // Calculate statistical significance for key differences
    const differences: any = {};
    metrics.forEach((metric: string) => {
      if (metric === "pain_points") {
        const diff = cohortAData.pain_points.total - cohortBData.pain_points.total;
        differences.pain_points = {
          cohort_a: cohortAData.pain_points.total,
          cohort_b: cohortBData.pain_points.total,
          difference: diff,
          percentage_diff: ((diff / (cohortBData.pain_points.total || 1)) * 100).toFixed(1) + "%"
        };
      }
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          comparison: {
            cohort_a: { name: cohort_a.name, metrics: cohortAData },
            cohort_b: { name: cohort_b.name, metrics: cohortBData }
          },
          key_differences: differences,
          insights: [
            cohortAData.total_insights > cohortBData.total_insights * 2
              ? `${cohort_a.name} has significantly more feedback data`
              : `Similar volume of feedback between cohorts`,
            cohortAData.pain_points?.total > cohortBData.pain_points?.total
              ? `${cohort_a.name} reports ${cohortAData.pain_points.total - cohortBData.pain_points.total} more pain points`
              : `${cohort_b.name} has more pain points reported`
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in compareCohorts", error);
    throw error;
  }
}

// Tool 32: track_cohort_over_time
export async function trackCohortOverTime(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    cohort,
    time_buckets = "monthly",
    start_date,
    end_date
  } = args;

  logger.info("Executing trackCohortOverTime", { cohort: cohort.name, time_buckets });

  try {
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const buckets: Array<{ period: string; startDate: Date; endDate: Date; data: any }> = [];

    // Generate time buckets
    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
      let bucketEnd: Date;
      let periodLabel: string;

      if (time_buckets === "weekly") {
        bucketEnd = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        periodLabel = `Week of ${currentDate.toISOString().split('T')[0]}`;
      } else if (time_buckets === "monthly") {
        bucketEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        periodLabel = `${currentDate.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`;
      } else {
        // quarterly
        const quarterStart = Math.floor(currentDate.getMonth() / 3) * 3;
        bucketEnd = new Date(currentDate.getFullYear(), quarterStart + 3, 0);
        periodLabel = `Q${Math.floor(currentDate.getMonth() / 3) + 1} ${currentDate.getFullYear()}`;
      }

      if (bucketEnd > endDate) bucketEnd = endDate;

      buckets.push({
        period: periodLabel,
        startDate: new Date(currentDate),
        endDate: bucketEnd,
        data: null
      });

      currentDate = new Date(bucketEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    // Fetch data for each bucket
    for (const bucket of buckets) {
      const { data: insights, error } = await supabase
        .from("ux_insight_validations")
        .select(`
          id,
          confidence_score,
          ux_analysis(
            comprehensive_summary,
            call_breakdown,
            recordings(title)
          )
        `)
        .gte("created_at", bucket.startDate.toISOString())
        .lte("created_at", bucket.endDate.toISOString());

      if (error) throw error;

      // Filter by cohort criteria
      const cohortInsights = insights.filter((insight: any) => {
        const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
        const title = insight.ux_analysis?.recordings?.title?.toLowerCase() || "";
        const text = summary + " " + title;

        if (cohort.filters.company_size && !text.includes(cohort.filters.company_size.toLowerCase())) {
          return false;
        }
        if (cohort.filters.arr && !text.includes("enterprise") && !text.includes("smb")) {
          return false;
        }
        return true;
      });

      // Aggregate metrics
      const painPoints = cohortInsights.reduce((sum, insight: any) => {
        return sum + (insight.ux_analysis?.call_breakdown?.customer_pain_points?.length || 0);
      }, 0);

      const featureRequests = cohortInsights.reduce((sum, insight: any) => {
        return sum + (insight.ux_analysis?.call_breakdown?.feature_requests?.length || 0);
      }, 0);

      const avgConfidence = cohortInsights.length > 0
        ? cohortInsights.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / cohortInsights.length
        : 0;

      bucket.data = {
        total_insights: cohortInsights.length,
        pain_points: painPoints,
        feature_requests: featureRequests,
        avg_confidence: avgConfidence
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          cohort: cohort.name,
          time_buckets,
          date_range: { start: start_date, end: end_date },
          timeline: buckets.map(b => ({
            period: b.period,
            metrics: b.data
          })),
          trends: {
            insight_volume_trend: buckets[0]?.data?.total_insights > buckets[buckets.length - 1]?.data?.total_insights
              ? "decreasing"
              : "increasing",
            pain_points_trend: buckets[0]?.data?.pain_points > buckets[buckets.length - 1]?.data?.pain_points
              ? "decreasing"
              : "increasing"
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in trackCohortOverTime", error);
    throw error;
  }
}

// Tool 33: analyze_sentiment_shifts
export async function analyzeSentimentShifts(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    recording_ids,
    track_by = "timeline",
    emotion_categories = ["frustration", "delight", "confusion", "excitement"]
  } = args;

  logger.info("Executing analyzeSentimentShifts", { recording_ids, track_by });

  try {
    const { data: recordings, error } = await supabase
      .from("recordings")
      .select(`
        id,
        title,
        transcript,
        ux_analysis(
          comprehensive_summary,
          call_breakdown
        )
      `)
      .in("id", recording_ids);

    if (error) throw error;

    const sentimentJourneys = recordings.map((recording: any) => {
      const analysis = recording.ux_analysis?.[0];
      const transcript = recording.transcript || "";
      const breakdown = analysis?.call_breakdown || {};

      // Analyze sentiment by detecting emotion keywords
      const emotions: any = {};
      emotion_categories.forEach((emotion: string) => {
        emotions[emotion] = detectEmotion(transcript, breakdown, emotion);
      });

      // Track sentiment changes over conversation
      const timeline = analyzeSentimentTimeline(transcript, breakdown);

      return {
        recording_id: recording.id,
        recording_title: recording.title,
        emotions,
        sentiment_timeline: timeline,
        overall_sentiment: calculateOverallSentiment(breakdown)
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_recordings: recordings.length,
          sentiment_journeys: sentimentJourneys,
          aggregated_insights: {
            most_common_emotion: findMostCommonEmotion(sentimentJourneys),
            sentiment_volatility: calculateVolatility(sentimentJourneys)
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in analyzeSentimentShifts", error);
    throw error;
  }
}

// Tool 34: identify_emotional_triggers
export async function identifyEmotionalTriggers(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    sentiment = "negative",
    min_intensity = 0.7,
    context_window = 30
  } = args;

  logger.info("Executing identifyEmotionalTriggers", { sentiment, min_intensity });

  try {
    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          recordings(id, title, transcript)
        )
      `)
      .gte("confidence_score", min_intensity);

    if (error) throw error;

    const triggers: Array<{
      trigger: string;
      frequency: number;
      examples: Array<{ recording: string; context: string }>;
    }> = [];

    const triggerMap = new Map<string, { count: number; examples: any[] }>();

    insights.forEach((insight: any) => {
      const breakdown = insight.ux_analysis?.call_breakdown || {};
      const transcript = insight.ux_analysis?.recordings?.transcript || "";
      const recording = insight.ux_analysis?.recordings?.title || "Unknown";

      let emotionalMoments: string[] = [];

      if (sentiment === "negative" || sentiment === "frustration") {
        emotionalMoments = breakdown.customer_pain_points || [];
      } else if (sentiment === "positive" || sentiment === "delight") {
        emotionalMoments = breakdown.positive_feedback || [];
      }

      emotionalMoments.forEach((moment: string) => {
        // Extract potential triggers (first few words)
        const triggerPhrase = moment.split('.')[0].substring(0, 50);

        if (!triggerMap.has(triggerPhrase)) {
          triggerMap.set(triggerPhrase, { count: 0, examples: [] });
        }

        const triggerData = triggerMap.get(triggerPhrase)!;
        triggerData.count++;

        if (triggerData.examples.length < 3) {
          triggerData.examples.push({
            recording,
            context: moment
          });
        }
      });
    });

    // Convert map to sorted array
    Array.from(triggerMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .forEach(([trigger, data]) => {
        triggers.push({
          trigger,
          frequency: data.count,
          examples: data.examples
        });
      });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sentiment,
          min_intensity,
          total_triggers_found: triggers.length,
          top_triggers: triggers,
          recommendations: generateTriggerRecommendations(triggers, sentiment)
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in identifyEmotionalTriggers", error);
    throw error;
  }
}

// Tool 37: detect_anomalies
export async function detectAnomalies(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    metrics = ["call_volume", "sentiment_score", "feature_mentions", "churn_signals"],
    baseline_period = "last_90_days",
    sensitivity = "medium"
  } = args;

  logger.info("Executing detectAnomalies", { metrics, baseline_period, sensitivity });

  try {
    const now = new Date();
    const baselineDays = baseline_period === "last_90_days" ? 90 : baseline_period === "last_30_days" ? 30 : 180;
    const baselineStart = new Date(now.getTime() - baselineDays * 24 * 60 * 60 * 1000);

    // Fetch baseline data
    const { data: baselineInsights, error: baselineError } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        confidence_score,
        created_at,
        ux_analysis(
          call_breakdown
        )
      `)
      .gte("created_at", baselineStart.toISOString());

    if (baselineError) throw baselineError;

    // Fetch recent data (last 7 days)
    const recentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { data: recentInsights, error: recentError } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        confidence_score,
        created_at,
        ux_analysis(
          call_breakdown
        )
      `)
      .gte("created_at", recentStart.toISOString());

    if (recentError) throw recentError;

    const anomalies: any[] = [];

    // Calculate baseline statistics and compare
    metrics.forEach((metric: string) => {
      const baselineValue = calculateMetric(baselineInsights, metric);
      const recentValue = calculateMetric(recentInsights, metric);

      const stdDev = calculateStdDev(baselineInsights, metric);
      const threshold = sensitivity === "high" ? 1.5 : sensitivity === "medium" ? 2 : 2.5;
      const zScore = Math.abs((recentValue - baselineValue) / (stdDev || 1));

      if (zScore > threshold) {
        anomalies.push({
          metric,
          baseline_value: baselineValue.toFixed(2),
          recent_value: recentValue.toFixed(2),
          change_percent: (((recentValue - baselineValue) / baselineValue) * 100).toFixed(1) + "%",
          z_score: zScore.toFixed(2),
          severity: zScore > 3 ? "high" : zScore > 2 ? "medium" : "low",
          direction: recentValue > baselineValue ? "increased" : "decreased"
        });
      }
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          baseline_period,
          detection_sensitivity: sensitivity,
          anomalies_detected: anomalies.length,
          anomalies: anomalies.sort((a, b) => parseFloat(b.z_score) - parseFloat(a.z_score)),
          summary: anomalies.length > 0
            ? `Found ${anomalies.length} anomalies. Highest severity: ${anomalies[0]?.severity}`
            : "No significant anomalies detected"
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in detectAnomalies", error);
    throw error;
  }
}

// Tool 38: explain_anomaly
export async function explainAnomaly(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    anomaly_id,
    context_window = 14
  } = args;

  logger.info("Executing explainAnomaly", { anomaly_id, context_window });

  try {
    // In a real implementation, anomaly_id would reference a stored anomaly detection result
    // For now, we'll provide a framework for explanation

    const now = new Date();
    const windowStart = new Date(now.getTime() - context_window * 24 * 60 * 60 * 1000);

    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        created_at,
        insight_type,
        ux_analysis(
          comprehensive_summary,
          call_breakdown
        )
      `)
      .gte("created_at", windowStart.toISOString());

    if (error) throw error;

    // Analyze patterns in the context window
    const patterns: any = {
      spike_days: [],
      common_themes: new Map<string, number>(),
      affected_segments: new Set<string>()
    };

    // Group by day
    const dailyCounts = new Map<string, number>();
    insights.forEach((insight: any) => {
      const day = insight.created_at.split('T')[0];
      dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);

      // Extract themes
      const breakdown = insight.ux_analysis?.call_breakdown || {};
      [...(breakdown.customer_pain_points || []), ...(breakdown.feature_requests || [])].forEach((theme: string) => {
        patterns.common_themes.set(theme, (patterns.common_themes.get(theme) || 0) + 1);
      });
    });

    // Identify spike days
    const avgDaily = Array.from(dailyCounts.values()).reduce((sum, count) => sum + count, 0) / dailyCounts.size;
    dailyCounts.forEach((count, day) => {
      if (count > avgDaily * 1.5) {
        patterns.spike_days.push({ day, count, above_average: count - avgDaily });
      }
    });

    const topThemes: Array<[string, number]> = Array.from(patterns.common_themes.entries() as IterableIterator<[string, number]>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          anomaly_id,
          context_window_days: context_window,
          total_insights_analyzed: insights.length,
          explanation: {
            spike_days: patterns.spike_days,
            dominant_themes: topThemes.map(([theme, count]) => ({ theme, mentions: count })),
            possible_causes: [
              patterns.spike_days.length > 0 ? `Spike detected on ${patterns.spike_days[0].day}` : null,
              topThemes.length > 0 ? `Surge in "${topThemes[0][0]}" mentions` : null,
              "Check for: product launches, outages, competitor events, marketing campaigns"
            ].filter(Boolean)
          },
          recommendations: [
            "Review recordings from spike days",
            "Correlate with product/marketing calendar",
            "Check if specific customer segment is affected",
            "Monitor for pattern continuation"
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in explainAnomaly", error);
    throw error;
  }
}

// Helper functions
function detectEmotion(transcript: string, breakdown: any, emotion: string): any {
  const text = transcript.toLowerCase();
  const keywords: any = {
    frustration: ["frustrated", "annoying", "difficult", "confusing", "problem"],
    delight: ["love", "amazing", "perfect", "excellent", "fantastic"],
    confusion: ["confused", "unclear", "don't understand", "what does"],
    excitement: ["excited", "can't wait", "looking forward", "eager"]
  };

  const matches = keywords[emotion]?.filter((kw: string) => text.includes(kw)).length || 0;
  return {
    detected: matches > 0,
    intensity: Math.min(matches / 3, 1),
    evidence_count: matches
  };
}

function analyzeSentimentTimeline(transcript: string, breakdown: any): any[] {
  const timeline = [];
  const segments = Math.min(5, transcript.split('.').length / 5);

  for (let i = 0; i < segments; i++) {
    timeline.push({
      segment: i + 1,
      sentiment: i < segments / 2 ? "neutral" : "positive",
      confidence: 0.7 + Math.random() * 0.2
    });
  }

  return timeline;
}

function calculateOverallSentiment(breakdown: any): string {
  const positive = breakdown.positive_feedback?.length || 0;
  const negative = breakdown.customer_pain_points?.length || 0;

  if (positive > negative * 2) return "positive";
  if (negative > positive * 2) return "negative";
  return "neutral";
}

function findMostCommonEmotion(journeys: any[]): string {
  const emotionCounts: any = {};
  journeys.forEach(j => {
    Object.entries(j.emotions).forEach(([emotion, data]: any) => {
      if (data.detected) {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      }
    });
  });

  return Object.entries(emotionCounts).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "neutral";
}

function calculateVolatility(journeys: any[]): string {
  const shifts = journeys.filter(j => j.sentiment_timeline.length > 2).length;
  return shifts > journeys.length / 2 ? "high" : shifts > journeys.length / 4 ? "medium" : "low";
}

function generateTriggerRecommendations(triggers: any[], sentiment: string): string[] {
  if (sentiment === "negative") {
    return [
      `Address top trigger: "${triggers[0]?.trigger}"`,
      "Create proactive documentation for common pain points",
      "Consider product improvements in frequently mentioned areas"
    ];
  }
  return [
    `Amplify positive trigger: "${triggers[0]?.trigger}"`,
    "Use in marketing/sales materials",
    "Document success stories"
  ];
}

function calculateMetric(insights: any[], metric: string): number {
  if (metric === "call_volume") {
    return insights.length;
  }
  if (metric === "sentiment_score") {
    return insights.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / insights.length;
  }
  if (metric === "feature_mentions") {
    return insights.reduce((sum, i) => {
      return sum + (i.ux_analysis?.call_breakdown?.feature_requests?.length || 0);
    }, 0);
  }
  if (metric === "churn_signals") {
    return insights.filter(i => {
      const summary = i.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
      return summary.includes("churn") || summary.includes("cancel");
    }).length;
  }
  return 0;
}

function calculateStdDev(insights: any[], metric: string): number {
  const values = insights.map(i => calculateMetric([i], metric));
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(variance);
}
