import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 13: validate_insight_batch
export async function validateInsightBatch(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { insight_ids, validation_status, reason_codes = [], reviewer_notes = null } = args;

  logger.info("Executing validate_insight_batch", {
    count: insight_ids.length,
    status: validation_status
  });

  try {
    const updates = insight_ids.map((id: string) => ({
      insight_id: id,
      validation_status,
      reason_codes,
      reviewer_notes,
      validated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from("ux_insight_validations")
      .upsert(updates, { onConflict: "insight_id" })
      .select();

    if (error) {
      throw new Error(`Batch validation failed: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          validated_count: data.length,
          validation_status,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in validateInsightBatch", error);
    throw error;
  }
}

// Tool 14: get_validation_queue
export async function getValidationQueue(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { limit = 100, min_confidence = 0.0 } = args;

  logger.info("Executing get_validation_queue", { limit, min_confidence });

  try {
    const { data, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        insight_type,
        confidence_score,
        created_at,
        ux_analysis(comprehensive_summary, provenance_enhanced)
      `)
      .eq("validation_status", "needs_review")
      .gte("confidence_score", min_confidence)
      .order("confidence_score", { ascending: true }) // Low confidence first
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch validation queue: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          queue_size: data.length,
          items: data,
          priority: "sorted by confidence (low to high)"
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in getValidationQueue", error);
    throw error;
  }
}

// Tool 15: predict_validation_outcome
export async function predictValidationOutcome(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { insight_id } = args;

  logger.info("Executing predict_validation_outcome", { insight_id });

  try {
    const { data, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_id,
        confidence_score,
        insight_type,
        ux_analysis(comprehensive_summary)
      `)
      .eq("insight_id", insight_id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch insight: ${error.message}`);
    }

    // Simple prediction based on confidence score
    let predicted_outcome = "needs_review";
    let prediction_confidence = 0.5;

    if (data.confidence_score >= 0.9) {
      predicted_outcome = "validated";
      prediction_confidence = 0.95;
    } else if (data.confidence_score >= 0.7) {
      predicted_outcome = "validated";
      prediction_confidence = 0.75;
    } else if (data.confidence_score < 0.3) {
      predicted_outcome = "rejected";
      prediction_confidence = 0.8;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          insight_id,
          current_confidence_score: data.confidence_score,
          predicted_outcome,
          prediction_confidence,
          recommendation: predicted_outcome === "needs_review"
            ? "Manual review recommended"
            : `Auto-${predicted_outcome} likely`
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in predictValidationOutcome", error);
    throw error;
  }
}

// Tool 16: override_validation
export async function overrideValidation(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const { insight_id, new_validation_status, override_reason, overridden_by } = args;

  logger.info("Executing override_validation", { insight_id, new_validation_status });

  try {
    const { data, error } = await supabase
      .from("ux_insight_validations")
      .update({
        validation_status: new_validation_status,
        reviewer_notes: `OVERRIDE: ${override_reason}`,
        validated_at: new Date().toISOString()
      })
      .eq("insight_id", insight_id)
      .select();

    if (error) {
      throw new Error(`Failed to override validation: ${error.message}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          insight_id,
          new_validation_status,
          override_reason,
          overridden_at: new Date().toISOString(),
          overridden_by
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in overrideValidation", error);
    throw error;
  }
}
