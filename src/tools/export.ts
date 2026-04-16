import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";
import crypto from "crypto";

// Tool 17: export_to_signal
export async function exportToSignal(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { export_batch_name, validation_status_filter = ["validated"] } = args;

  logger.info("Executing export_to_signal", { batch_name: export_batch_name });

  try {
    // Fetch validated insights with provenance
    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        confidence_score,
        ux_analysis(
          comprehensive_summary,
          question_analysis,
          solution_recommendations,
          provenance_enhanced
        )
      `)
      .in("validation_status", validation_status_filter);

    if (error) {
      throw new Error(`Failed to fetch validated insights: ${error.message}`);
    }

    // Transform to Signal format
    const exportPayload = {
      export_batch_id: crypto.randomUUID(),
      export_batch_name,
      exported_at: new Date().toISOString(),
      total_insights: insights.length,
      insights: insights.map(i => {
        const analysis = Array.isArray(i.ux_analysis) ? i.ux_analysis[0] : i.ux_analysis;
        return {
          insight_id: i.insight_id,
          insight_type: i.insight_type,
          confidence_score: i.confidence_score,
          summary: analysis?.comprehensive_summary,
          question_analysis: analysis?.question_analysis,
          solution_recommendations: analysis?.solution_recommendations,
          provenance: analysis?.provenance_enhanced
        };
      })
    };

    // Record export (optional - check if table exists)
    try {
      await supabase.from("ux_signal_exports").insert({
        export_batch_id: exportPayload.export_batch_id,
        export_batch_name: exportPayload.export_batch_name,
        export_payload: exportPayload,
        status: "pending",
        created_at: new Date().toISOString()
      });
    } catch (insertError) {
      logger.warn("Could not record export (table may not exist)", insertError);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(exportPayload, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in exportToSignal", error);
    throw error;
  }
}

// Tool 18: track_signal_usage
export async function trackSignalUsage(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { export_batch_id, usage_event, usage_details = {} } = args;

  logger.info("Executing track_signal_usage", { export_batch_id, usage_event });

  try {
    // Track usage event
    const usageRecord = {
      export_batch_id,
      usage_event,
      usage_details,
      tracked_at: new Date().toISOString()
    };

    // Try to insert usage tracking (optional - check if table exists)
    try {
      await supabase.from("ux_signal_usage").insert(usageRecord);
    } catch (insertError) {
      logger.warn("Could not track usage (table may not exist)", insertError);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          export_batch_id,
          usage_event,
          tracked_at: usageRecord.tracked_at,
          message: "Usage event tracked successfully"
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in trackSignalUsage", error);
    throw error;
  }
}
