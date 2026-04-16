import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 1: search_insights_by_scope
export async function searchInsightsByScope(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { scope, limit = 1000, offset = 0 } = args;

  logger.info("Executing search_insights_by_scope", { scope, limit, offset });

  try {
    let query = supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        validation_status,
        confidence_score,
        created_at,
        ux_analysis!inner(
          recording_id,
          comprehensive_summary,
          question_analysis,
          solution_recommendations,
          provenance_enhanced
        ),
        recordings!inner(
          title,
          created_at,
          team_id
        )
      `)
      .range(offset, offset + limit - 1);

    // Apply scope filters
    if (scope.validation_status && scope.validation_status.length > 0) {
      query = query.in("validation_status", scope.validation_status);
    }

    if (scope.quality_threshold !== undefined) {
      query = query.gte("confidence_score", scope.quality_threshold);
    }

    if (scope.date_range) {
      query = query
        .gte("created_at", scope.date_range.start)
        .lte("created_at", scope.date_range.end);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    logger.info(`Found ${data.length} insights matching scope`);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: data.length,
          insights: data,
          scope_applied: scope,
          pagination: { limit, offset, hasMore: data.length === limit }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in searchInsightsByScope", error);
    throw error;
  }
}

// Tool 2: get_collection_items
export async function getCollectionItems(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { collection_id, include_provenance = true } = args;

  logger.info("Executing get_collection_items", { collection_id });

  try {
    let query = supabase
      .from("ux_collection_items")
      .select(`
        id,
        collection_id,
        recording_id,
        item_type,
        title,
        content,
        ${include_provenance ? 'provenance,' : ''}
        created_at,
        recordings(title, created_at)
      `)
      .eq("collection_id", collection_id);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch collection items: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          collection_id,
          total_items: data.length,
          items: data
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in getCollectionItems", error);
    throw error;
  }
}

// Tool 3: search_by_confidence
export async function searchByConfidence(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { min_confidence = 0.0, max_confidence = 1.0, limit = 1000 } = args;

  logger.info("Executing search_by_confidence", { min_confidence, max_confidence, limit });

  try {
    const { data, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        confidence_score,
        validation_status,
        created_at,
        ux_analysis(comprehensive_summary)
      `)
      .gte("confidence_score", min_confidence)
      .lte("confidence_score", max_confidence)
      .order("confidence_score", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: data.length,
          confidence_range: { min: min_confidence, max: max_confidence },
          insights: data
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in searchByConfidence", error);
    throw error;
  }
}

// Tool 4: search_by_validation_status
export async function searchByValidationStatus(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { validation_status, limit = 1000, offset = 0 } = args;

  logger.info("Executing search_by_validation_status", { validation_status, limit });

  try {
    const { data, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        validation_status,
        confidence_score,
        created_at,
        ux_analysis(comprehensive_summary, provenance_enhanced)
      `)
      .in("validation_status", validation_status)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: data.length,
          validation_status_filter: validation_status,
          insights: data
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in searchByValidationStatus", error);
    throw error;
  }
}

// Tool 5: get_insight_provenance
export async function getInsightProvenance(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { insight_id } = args;

  logger.info("Executing get_insight_provenance", { insight_id });

  try {
    const { data, error } = await supabase
      .from("ux_analysis")
      .select(`
        id,
        recording_id,
        comprehensive_summary,
        provenance_enhanced,
        created_at,
        recordings(
          title,
          created_at,
          audio_url
        )
      `)
      .eq("id", insight_id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch provenance: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          insight_id,
          provenance: data.provenance_enhanced,
          recording: data.recordings,
          summary: data.comprehensive_summary
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in getInsightProvenance", error);
    throw error;
  }
}

// Tool 6: search_recordings_metadata
export async function searchRecordingsMetadata(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { date_range, limit = 1000, offset = 0 } = args;

  logger.info("Executing search_recordings_metadata", { date_range, limit });

  try {
    let query = supabase
      .from("recordings")
      .select("id, title, created_at, duration, team_id, user_id, audio_url")
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (date_range) {
      query = query
        .gte("created_at", date_range.start)
        .lte("created_at", date_range.end);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: data.length,
          recordings: data,
          pagination: { limit, offset, hasMore: data.length === limit }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in searchRecordingsMetadata", error);
    throw error;
  }
}

// Tool 7: get_cross_workspace_insights
export async function getCrossWorkspaceInsights(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { workspace_types = ["sales", "support", "ux"], limit = 1000 } = args;

  logger.info("Executing get_cross_workspace_insights", { workspace_types, limit });

  try {
    // Query ux_analysis table (which contains analysis across all workspaces)
    const { data, error } = await supabase
      .from("ux_analysis")
      .select(`
        id,
        recording_id,
        comprehensive_summary,
        question_analysis,
        solution_recommendations,
        created_at,
        recordings(title, team_id)
      `)
      .limit(limit)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: data.length,
          workspace_types_requested: workspace_types,
          insights: data,
          note: "Cross-workspace aggregation based on unified ux_analysis table"
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in getCrossWorkspaceInsights", error);
    throw error;
  }
}
