import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 25: map_customer_journey
export async function mapCustomerJourney(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    customer_id,
    journey_stages = ["awareness", "consideration", "onboarding", "adoption", "renewal"],
    include_timeline = true
  } = args;

  logger.info("Executing mapCustomerJourney", { customer_id, journey_stages });

  try {
    // Fetch all insights related to this customer
    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_type,
        created_at,
        confidence_score,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          recordings(id, title, created_at)
        )
      `)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Filter insights related to this customer
    const customerInsights = insights.filter((insight: any) => {
      const title = insight.ux_analysis?.recordings?.title?.toLowerCase() || "";
      const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
      return title.includes(customer_id.toLowerCase()) || summary.includes(customer_id.toLowerCase());
    });

    // Map insights to journey stages
    const journeyMap: any = {};
    journey_stages.forEach((stage: string) => {
      journeyMap[stage] = {
        insights: [],
        pain_points: [],
        successes: [],
        feature_requests: []
      };
    });

    customerInsights.forEach((insight: any) => {
      const stage = detectJourneyStage(insight, journey_stages);
      const breakdown = insight.ux_analysis?.call_breakdown || {};

      if (journeyMap[stage]) {
        journeyMap[stage].insights.push({
          id: insight.id,
          date: insight.created_at,
          summary: insight.ux_analysis?.comprehensive_summary?.substring(0, 150),
          recording: insight.ux_analysis?.recordings?.title
        });

        journeyMap[stage].pain_points.push(...(breakdown.customer_pain_points || []));
        journeyMap[stage].successes.push(...(breakdown.positive_feedback || []));
        journeyMap[stage].feature_requests.push(...(breakdown.feature_requests || []));
      }
    });

    // Calculate stage health scores
    const stageHealth: any = {};
    Object.entries(journeyMap).forEach(([stage, data]: any) => {
      const painCount = data.pain_points.length;
      const successCount = data.successes.length;
      stageHealth[stage] = {
        health_score: successCount > painCount ? "healthy" : painCount > successCount * 2 ? "at_risk" : "neutral",
        insight_count: data.insights.length,
        pain_points: painCount,
        successes: successCount
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          customer_id,
          total_touchpoints: customerInsights.length,
          journey_map: Object.entries(journeyMap).map(([stage, data]: any) => ({
            stage,
            insights: data.insights,
            top_pain_points: [...new Set(data.pain_points)].slice(0, 5),
            top_successes: [...new Set(data.successes)].slice(0, 3),
            feature_requests: [...new Set(data.feature_requests)].slice(0, 5),
            health: stageHealth[stage]
          })),
          timeline: include_timeline ? generateTimeline(customerInsights) : null,
          recommendations: generateJourneyRecommendations(stageHealth, journeyMap)
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in mapCustomerJourney", error);
    throw error;
  }
}

// Tool 26: identify_journey_gaps
export async function identifyJourneyGaps(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    journey_template = "saas_b2b",
    date_range
  } = args;

  logger.info("Executing identifyJourneyGaps", { journey_template });

  try {
    const journeyStages = getJourneyTemplate(journey_template);

    // Fetch all insights in date range
    let query = supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_type,
        ux_analysis(
          comprehensive_summary,
          recordings(title)
        )
      `);

    if (date_range) {
      query = query
        .gte("created_at", date_range.start)
        .lte("created_at", date_range.end);
    }

    const { data: insights, error } = await query;
    if (error) throw error;

    // Count insights per stage
    const stageCoverage: any = {};
    journeyStages.forEach(stage => {
      stageCoverage[stage] = {
        count: 0,
        percentage: 0,
        status: "unknown"
      };
    });

    insights.forEach((insight: any) => {
      const stage = detectJourneyStage(insight, journeyStages);
      if (stageCoverage[stage]) {
        stageCoverage[stage].count++;
      }
    });

    // Calculate percentages and identify gaps
    const total = insights.length;
    const gaps: any[] = [];

    Object.entries(stageCoverage).forEach(([stage, data]: any) => {
      data.percentage = ((data.count / total) * 100).toFixed(1);

      if (data.count < 5) {
        data.status = "critical_gap";
        gaps.push({
          stage,
          severity: "high",
          insight_count: data.count,
          recommendation: `Need at least 5 more insights from ${stage} stage`
        });
      } else if (data.count < 15) {
        data.status = "under_represented";
        gaps.push({
          stage,
          severity: "medium",
          insight_count: data.count,
          recommendation: `Consider gathering more ${stage} feedback`
        });
      } else {
        data.status = "well_covered";
      }
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          journey_template,
          total_insights: total,
          stage_coverage: stageCoverage,
          gaps: gaps.sort((a, b) => a.insight_count - b.insight_count),
          recommendations: [
            gaps.length > 0 ? `Focus next research on: ${gaps[0].stage}` : "Journey coverage is balanced",
            "Schedule calls with customers at underrepresented stages",
            "Review existing recordings for missed stage classifications"
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in identifyJourneyGaps", error);
    throw error;
  }
}

// Tool 27: create_insight_snapshot
export async function createInsightSnapshot(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    title,
    description,
    include_filters,
    share_with = [],
    tags = []
  } = args;

  logger.info("Executing createInsightSnapshot", { title, tags });

  try {
    // Create snapshot record
    const { data: snapshot, error } = await supabase
      .from("research_snapshots")
      .insert({
        title,
        description,
        filters: include_filters,
        tags,
        shared_with: share_with,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch insights matching the filters and associate with snapshot
    const { data: insights, error: insightError } = await supabase
      .from("ux_insight_validations")
      .select("id")
      .limit(100); // Apply filters from include_filters

    if (insightError) throw insightError;

    // Link insights to snapshot
    const snapshotItems = insights.map((insight: any) => ({
      snapshot_id: snapshot.id,
      insight_id: insight.id,
      added_at: new Date().toISOString()
    }));

    await supabase.from("research_snapshot_items").insert(snapshotItems);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          snapshot_id: snapshot.id,
          title,
          description,
          insights_captured: insights.length,
          tags,
          shared_with: share_with,
          url: `/research/snapshots/${snapshot.id}`,
          message: `Snapshot "${title}" created with ${insights.length} insights`
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in createInsightSnapshot", error);
    throw error;
  }
}

// Tool 28: search_research_history
export async function searchResearchHistory(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    query,
    timeframe = "last_12_months",
    similarity_threshold = 0.7
  } = args;

  logger.info("Executing searchResearchHistory", { query, timeframe });

  try {
    const now = new Date();
    const monthsAgo = timeframe === "last_12_months" ? 12 : timeframe === "last_6_months" ? 6 : 24;
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);

    // Search research snapshots
    const { data: snapshots, error } = await supabase
      .from("research_snapshots")
      .select(`
        id,
        title,
        description,
        tags,
        created_at,
        filters
      `)
      .gte("created_at", startDate.toISOString());

    if (error) throw error;

    // Calculate relevance scores
    const queryTerms = query.toLowerCase().split(' ');
    const scoredSnapshots = snapshots.map((snapshot: any) => {
      const searchText = (
        snapshot.title + " " +
        snapshot.description + " " +
        snapshot.tags.join(" ")
      ).toLowerCase();

      const matchCount = queryTerms.filter((term: string) => searchText.includes(term)).length;
      const relevanceScore = matchCount / queryTerms.length;

      return {
        ...snapshot,
        relevance_score: relevanceScore
      };
    }).filter(s => s.relevance_score >= similarity_threshold);

    // Sort by relevance
    scoredSnapshots.sort((a, b) => b.relevance_score - a.relevance_score);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          query,
          timeframe,
          total_found: scoredSnapshots.length,
          results: scoredSnapshots.slice(0, 10).map(s => ({
            snapshot_id: s.id,
            title: s.title,
            description: s.description,
            relevance_score: (s.relevance_score * 100).toFixed(1) + "%",
            created_at: s.created_at,
            tags: s.tags,
            url: `/research/snapshots/${s.id}`
          })),
          suggestions: scoredSnapshots.length === 0 ? [
            "Try broader search terms",
            "Expand timeframe",
            "Check for typos"
          ] : []
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in searchResearchHistory", error);
    throw error;
  }
}

// Tool 29: add_research_note
export async function addResearchNote(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    insight_id,
    note_type,
    content,
    mention_users = []
  } = args;

  logger.info("Executing addResearchNote", { insight_id, note_type });

  try {
    const { data: note, error } = await supabase
      .from("research_notes")
      .insert({
        insight_id,
        note_type,
        content,
        mentioned_users: mention_users,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Send notifications to mentioned users
    if (mention_users.length > 0) {
      const notifications = mention_users.map((user_id: string) => ({
        user_id,
        type: "research_note_mention",
        content: `You were mentioned in a ${note_type} note`,
        reference_id: note.id,
        created_at: new Date().toISOString()
      }));

      await supabase.from("notifications").insert(notifications);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          note_id: note.id,
          insight_id,
          note_type,
          content,
          mentions: mention_users.length,
          created_at: note.created_at,
          message: `${note_type} note added successfully`
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in addResearchNote", error);
    throw error;
  }
}

// Tool 30: get_team_annotations
export async function getTeamAnnotations(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    scope = {},
    include_unresolved_questions = true
  } = args;

  logger.info("Executing getTeamAnnotations", { include_unresolved_questions });

  try {
    let query = supabase
      .from("research_notes")
      .select(`
        id,
        insight_id,
        note_type,
        content,
        created_at,
        mentioned_users,
        is_resolved,
        ux_insight_validations(
          insight_type,
          ux_analysis(
            recordings(title)
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (include_unresolved_questions) {
      query = query.or("note_type.eq.question,is_resolved.eq.false");
    }

    const { data: notes, error } = await query.limit(100);
    if (error) throw error;

    // Group by note type
    const grouped: any = {
      hypotheses: [],
      questions: [],
      observations: [],
      action_items: []
    };

    notes.forEach((note: any) => {
      const noteType = note.note_type;
      if (grouped[noteType + 's']) {
        grouped[noteType + 's'].push({
          note_id: note.id,
          insight_id: note.insight_id,
          content: note.content,
          recording: note.ux_insight_validations?.ux_analysis?.recordings?.title,
          created_at: note.created_at,
          is_resolved: note.is_resolved,
          mentions: note.mentioned_users?.length || 0
        });
      }
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_annotations: notes.length,
          annotations_by_type: {
            hypotheses: grouped.hypotheses.length,
            questions: grouped.questions.length,
            observations: grouped.observations.length,
            action_items: grouped.action_items.length
          },
          unresolved_questions: grouped.questions.filter((q: any) => !q.is_resolved).length,
          recent_annotations: {
            hypotheses: grouped.hypotheses.slice(0, 5),
            questions: grouped.questions.slice(0, 5),
            observations: grouped.observations.slice(0, 5),
            action_items: grouped.action_items.slice(0, 5)
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in getTeamAnnotations", error);
    throw error;
  }
}

// Helper functions
function detectJourneyStage(insight: any, journeyStages: string[]): string {
  const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
  const title = insight.ux_analysis?.recordings?.title?.toLowerCase() || "";
  const text = summary + " " + title;

  const stageKeywords: any = {
    awareness: ["first heard", "discovered", "learned about", "research", "evaluation"],
    consideration: ["demo", "trial", "pricing", "comparing", "evaluation"],
    onboarding: ["setup", "onboarding", "getting started", "first time", "initial"],
    adoption: ["using", "workflow", "daily", "team", "rollout"],
    renewal: ["renewal", "contract", "qbr", "review", "expansion"]
  };

  for (const stage of journeyStages) {
    const keywords = stageKeywords[stage] || [];
    if (keywords.some((kw: string) => text.includes(kw))) {
      return stage;
    }
  }

  return "adoption"; // default stage
}

function generateTimeline(insights: any[]): any[] {
  return insights.map(insight => ({
    date: insight.created_at,
    event: insight.ux_analysis?.recordings?.title,
    summary: insight.ux_analysis?.comprehensive_summary?.substring(0, 100)
  }));
}

function generateJourneyRecommendations(stageHealth: any, journeyMap: any): string[] {
  const recommendations = [];

  Object.entries(stageHealth).forEach(([stage, health]: any) => {
    if (health.health_score === "at_risk") {
      recommendations.push(`Address pain points in ${stage} stage (${health.pain_points} issues reported)`);
    }
    if (health.insight_count === 0) {
      recommendations.push(`No feedback from ${stage} stage - schedule customer interviews`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push("Customer journey looks healthy across all stages");
  }

  return recommendations;
}

function getJourneyTemplate(template: string): string[] {
  const templates: any = {
    saas_b2b: ["awareness", "consideration", "onboarding", "adoption", "renewal"],
    ecommerce: ["discovery", "evaluation", "purchase", "delivery", "retention"],
    custom: ["stage_1", "stage_2", "stage_3", "stage_4", "stage_5"]
  };

  return templates[template] || templates.saas_b2b;
}
