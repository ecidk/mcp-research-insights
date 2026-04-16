import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 47: assess_research_quality
export async function assessResearchQuality(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    recording_ids,
    criteria = [
      "sample_diversity",
      "question_quality",
      "bias_detection",
      "saturation_reached",
      "proper_documentation"
    ]
  } = args;

  logger.info("Executing assessResearchQuality", { recording_ids, criteria });

  try {
    const { data: recordings, error } = await supabase
      .from("recordings")
      .select(`
        id,
        title,
        duration,
        transcript,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          question_analysis
        )
      `)
      .in("id", recording_ids);

    if (error) throw error;

    const qualityScores: any = {};
    const overallScores: number[] = [];

    // Assess each criterion
    if (criteria.includes("sample_diversity")) {
      qualityScores.sample_diversity = assessSampleDiversity(recordings);
      overallScores.push(qualityScores.sample_diversity.score);
    }

    if (criteria.includes("question_quality")) {
      qualityScores.question_quality = assessQuestionQuality(recordings);
      overallScores.push(qualityScores.question_quality.score);
    }

    if (criteria.includes("bias_detection")) {
      qualityScores.bias_detection = detectBias(recordings);
      overallScores.push(qualityScores.bias_detection.score);
    }

    if (criteria.includes("saturation_reached")) {
      qualityScores.saturation_reached = assessSaturation(recordings);
      overallScores.push(qualityScores.saturation_reached.score);
    }

    if (criteria.includes("proper_documentation")) {
      qualityScores.proper_documentation = assessDocumentation(recordings);
      overallScores.push(qualityScores.proper_documentation.score);
    }

    // Calculate overall quality score
    const overallScore = overallScores.reduce((sum, s) => sum + s, 0) / overallScores.length;
    const qualityGrade = overallScore >= 0.85 ? "Excellent" :
                        overallScore >= 0.70 ? "Good" :
                        overallScore >= 0.55 ? "Acceptable" : "Needs Improvement";

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_recordings: recordings.length,
          overall_quality_score: (overallScore * 100).toFixed(1) + "%",
          quality_grade: qualityGrade,
          criteria_scores: qualityScores,
          improvement_suggestions: generateImprovementSuggestions(qualityScores),
          certification: overallScore >= 0.70 ? "Research meets quality standards" : "Research requires improvement before use"
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in assessResearchQuality", error);
    throw error;
  }
}

// Tool 48: detect_research_bias
export async function detectResearchBias(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    recording_id,
    bias_types = ["leading_questions", "selection_bias", "confirmation_bias"]
  } = args;

  logger.info("Executing detectResearchBias", { recording_id, bias_types });

  try {
    const { data: recording, error } = await supabase
      .from("recordings")
      .select(`
        id,
        title,
        transcript,
        ux_analysis(
          comprehensive_summary,
          question_analysis
        )
      `)
      .eq("id", recording_id)
      .single();

    if (error) throw error;

    const biasFindings: any[] = [];
    let overallBiasScore = 0;

    // Check for leading questions
    if (bias_types.includes("leading_questions")) {
      const leadingQuestions = detectLeadingQuestions(recording.transcript);
      if (leadingQuestions.found) {
        biasFindings.push({
          bias_type: "leading_questions",
          severity: "medium",
          examples: leadingQuestions.examples,
          impact: "May have influenced participant responses",
          recommendation: "Rephrase as open-ended: 'What do you think about...' instead of 'Don't you think...'"
        });
        overallBiasScore += 2;
      }
    }

    // Check for selection bias
    if (bias_types.includes("selection_bias")) {
      const selectionBias = detectSelectionBias(recording);
      if (selectionBias.detected) {
        biasFindings.push({
          bias_type: "selection_bias",
          severity: "high",
          indicators: selectionBias.indicators,
          impact: "Sample may not represent target population",
          recommendation: "Recruit more diverse participants across segments"
        });
        overallBiasScore += 3;
      }
    }

    // Check for confirmation bias
    if (bias_types.includes("confirmation_bias")) {
      const confirmationBias = detectConfirmationBias(recording.transcript);
      if (confirmationBias.detected) {
        biasFindings.push({
          bias_type: "confirmation_bias",
          severity: "medium",
          examples: confirmationBias.examples,
          impact: "May have selectively emphasized supporting evidence",
          recommendation: "Actively probe for disconfirming evidence"
        });
        overallBiasScore += 2;
      }
    }

    const biasRating = overallBiasScore === 0 ? "minimal" :
                      overallBiasScore < 3 ? "low" :
                      overallBiasScore < 5 ? "moderate" : "high";

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          recording_id,
          recording_title: recording.title,
          bias_assessment: {
            overall_bias_rating: biasRating,
            bias_score: overallBiasScore,
            max_score: 10
          },
          findings: biasFindings,
          data_quality_impact: overallBiasScore > 5 ? "significant" : overallBiasScore > 2 ? "moderate" : "minimal",
          recommendations: [
            ...biasFindings.map(f => f.recommendation),
            biasFindings.length > 0 ? "Consider excluding this recording from analysis" : "Recording is suitable for analysis"
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in detectResearchBias", error);
    throw error;
  }
}

// Tool 49: audit_data_usage
export async function auditDataUsage(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    date_range,
    user_id = null,
    include_exports = true
  } = args;

  logger.info("Executing auditDataUsage", { date_range, user_id });

  try {
    let query = supabase
      .from("data_access_logs")
      .select(`
        id,
        user_id,
        action_type,
        resource_type,
        resource_id,
        accessed_at,
        metadata
      `)
      .gte("accessed_at", date_range.start)
      .lte("accessed_at", date_range.end)
      .order("accessed_at", { ascending: false });

    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    const { data: logs, error } = await query;
    if (error) throw error;

    // Categorize access patterns
    const accessSummary = {
      total_accesses: logs.length,
      by_action: new Map<string, number>(),
      by_user: new Map<string, number>(),
      by_resource_type: new Map<string, number>(),
      exports: [] as any[],
      sensitive_access: [] as any[]
    };

    logs.forEach((log: any) => {
      accessSummary.by_action.set(
        log.action_type,
        (accessSummary.by_action.get(log.action_type) || 0) + 1
      );

      accessSummary.by_user.set(
        log.user_id,
        (accessSummary.by_user.get(log.user_id) || 0) + 1
      );

      accessSummary.by_resource_type.set(
        log.resource_type,
        (accessSummary.by_resource_type.get(log.resource_type) || 0) + 1
      );

      if (include_exports && log.action_type === "export") {
        accessSummary.exports.push({
          user_id: log.user_id,
          resource: log.resource_id,
          export_format: log.metadata?.format,
          exported_at: log.accessed_at
        });
      }

      if (log.metadata?.contains_pii === true) {
        accessSummary.sensitive_access.push({
          user_id: log.user_id,
          resource: log.resource_id,
          accessed_at: log.accessed_at
        });
      }
    });

    // Identify unusual patterns
    const anomalies: any[] = [];

    // Check for bulk exports
    const exportsByUser = new Map<string, number>();
    accessSummary.exports.forEach(exp => {
      exportsByUser.set(exp.user_id, (exportsByUser.get(exp.user_id) || 0) + 1);
    });

    exportsByUser.forEach((count, userId) => {
      if (count > 10) {
        anomalies.push({
          type: "bulk_export",
          user_id: userId,
          export_count: count,
          severity: "medium",
          note: "User performed unusually high number of exports"
        });
      }
    });

    // Check for after-hours access
    const afterHoursAccess = logs.filter(log => {
      const hour = new Date(log.accessed_at).getHours();
      return hour < 6 || hour > 22; // Before 6 AM or after 10 PM
    });

    if (afterHoursAccess.length > 5) {
      anomalies.push({
        type: "after_hours_access",
        count: afterHoursAccess.length,
        severity: "low",
        note: "Multiple accesses outside business hours"
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          audit_period: date_range,
          summary: {
            total_accesses: accessSummary.total_accesses,
            unique_users: accessSummary.by_user.size,
            total_exports: accessSummary.exports.length,
            sensitive_data_accesses: accessSummary.sensitive_access.length
          },
          access_breakdown: {
            by_action: Object.fromEntries(accessSummary.by_action),
            by_resource_type: Object.fromEntries(accessSummary.by_resource_type)
          },
          top_users: Array.from(accessSummary.by_user.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([userId, count]) => ({ user_id: userId, access_count: count })),
          exports: include_exports ? accessSummary.exports.slice(0, 20) : [],
          anomalies,
          compliance_status: anomalies.length > 0 ? "review_required" : "compliant"
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in auditDataUsage", error);
    throw error;
  }
}

// Tool 50: anonymize_insights
export async function anonymizeInsights(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    insight_ids,
    anonymization_level = "partial",
    preserve_context = true
  } = args;

  logger.info("Executing anonymizeInsights", { insight_ids, anonymization_level });

  try {
    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          recordings(title, transcript)
        )
      `)
      .in("id", insight_ids);

    if (error) throw error;

    const anonymizedInsights = insights.map((insight: any) => {
      const analysis = insight.ux_analysis;

      let anonymizedData: any = {
        insight_id: insight.id,
        original_recording_id: analysis?.recordings?.id
      };

      if (anonymization_level === "full") {
        // Full anonymization: remove all identifying info
        anonymizedData = {
          ...anonymizedData,
          summary: removeIdentifiers(analysis?.comprehensive_summary || "", preserve_context),
          call_breakdown: anonymizeBreakdown(analysis?.call_breakdown || {}, preserve_context),
          recording_title: "[Anonymized Call]",
          transcript: null // Remove transcript entirely
        };
      } else if (anonymization_level === "partial") {
        // Partial: keep structure but mask names/companies
        anonymizedData = {
          ...anonymizedData,
          summary: maskNames(analysis?.comprehensive_summary || ""),
          call_breakdown: anonymizeBreakdown(analysis?.call_breakdown || {}, true),
          recording_title: maskNames(analysis?.recordings?.title || ""),
          transcript: preserve_context ? maskNames(analysis?.recordings?.transcript || "") : null
        };
      }

      // Store anonymization mapping (for potential de-anonymization by authorized users)
      const mappingKey = generateAnonymizationKey();
      anonymizedData.anonymization_key = mappingKey;

      return anonymizedData;
    });

    // Store anonymized versions
    const { data: stored, error: storeError } = await supabase
      .from("anonymized_insights")
      .insert(
        anonymizedInsights.map(ai => ({
          original_insight_id: ai.insight_id,
          anonymized_data: ai,
          anonymization_level,
          created_at: new Date().toISOString()
        }))
      )
      .select();

    if (storeError) throw storeError;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total_anonymized: anonymizedInsights.length,
          anonymization_level,
          preserve_context,
          anonymized_insights: anonymizedInsights.map(ai => ({
            original_id: ai.insight_id,
            anonymization_key: ai.anonymization_key,
            summary_preview: ai.summary?.substring(0, 100)
          })),
          storage: {
            table: "anonymized_insights",
            record_ids: stored.map((s: any) => s.id)
          },
          usage_notes: [
            "Anonymized insights are safe for external sharing",
            "Original insights remain in database with restricted access",
            preserve_context ? "Context preserved for research validity" : "Maximum anonymization applied",
            "De-anonymization requires admin approval and anonymization_key"
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in anonymizeInsights", error);
    throw error;
  }
}

// Helper functions
function assessSampleDiversity(recordings: any[]): any {
  const segments = new Set<string>();
  const industries = new Set<string>();
  const callTypes = new Set<string>();

  recordings.forEach(rec => {
    const title = rec.title?.toLowerCase() || "";
    if (title.includes("enterprise")) segments.add("enterprise");
    if (title.includes("smb")) segments.add("smb");
    if (title.includes("discovery")) callTypes.add("discovery");
    if (title.includes("support")) callTypes.add("support");
  });

  const diversityScore = Math.min((segments.size * 0.3 + callTypes.size * 0.2) / 1.0, 1.0);

  return {
    score: diversityScore,
    details: {
      customer_segments: segments.size,
      call_types: callTypes.size,
      geographic_diversity: "unknown"
    },
    status: diversityScore > 0.7 ? "diverse" : "limited_diversity"
  };
}

function assessQuestionQuality(recordings: any[]): any {
  let openEndedCount = 0;
  let leadingCount = 0;
  let totalQuestions = 0;

  recordings.forEach(rec => {
    const transcript = rec.transcript?.toLowerCase() || "";
    const questions = transcript.match(/\?/g)?.length || 0;
    totalQuestions += questions;

    if (transcript.includes("tell me about") || transcript.includes("how do you")) {
      openEndedCount++;
    }
    if (transcript.includes("don't you think") || transcript.includes("wouldn't you agree")) {
      leadingCount++;
    }
  });

  const qualityScore = totalQuestions > 0
    ? (openEndedCount / totalQuestions) * 0.8 + (1 - leadingCount / totalQuestions) * 0.2
    : 0.5;

  return {
    score: qualityScore,
    details: {
      total_questions: totalQuestions,
      open_ended: openEndedCount,
      leading_questions: leadingCount,
      avg_per_recording: (totalQuestions / recordings.length).toFixed(1)
    },
    status: qualityScore > 0.7 ? "high_quality" : "needs_improvement"
  };
}

function detectBias(recordings: any[]): any {
  let biasIndicators = 0;

  recordings.forEach(rec => {
    const transcript = rec.transcript?.toLowerCase() || "";
    if (transcript.includes("don't you think")) biasIndicators++;
    if (transcript.includes("obviously")) biasIndicators++;
    if (transcript.includes("clearly")) biasIndicators++;
  });

  const biasScore = Math.max(0, 1 - (biasIndicators / recordings.length) * 0.2);

  return {
    score: biasScore,
    details: {
      bias_indicators_found: biasIndicators,
      types: biasIndicators > 0 ? ["leading_questions", "loaded_language"] : []
    },
    status: biasScore > 0.8 ? "minimal_bias" : "bias_detected"
  };
}

function assessSaturation(recordings: any[]): any {
  const themes = new Map<string, number>();

  recordings.forEach(rec => {
    const breakdown = rec.ux_analysis?.call_breakdown || {};
    [...(breakdown.customer_pain_points || []), ...(breakdown.feature_requests || [])].forEach((theme: string) => {
      themes.set(theme, (themes.get(theme) || 0) + 1);
    });
  });

  const uniqueThemes = themes.size;
  const lastQuarterNewThemes = 0; // Would need temporal analysis

  const saturationScore = uniqueThemes > 0 ? Math.min(1, uniqueThemes / 20) : 0;

  return {
    score: saturationScore,
    details: {
      unique_themes: uniqueThemes,
      diminishing_returns: lastQuarterNewThemes < 2,
      recommended_sample_size: Math.max(30, uniqueThemes * 2)
    },
    status: uniqueThemes < 10 ? "not_saturated" : "approaching_saturation"
  };
}

function assessDocumentation(recordings: any[]): any {
  let wellDocumented = 0;

  recordings.forEach(rec => {
    const hasSummary = rec.ux_analysis?.comprehensive_summary?.length > 100;
    const hasBreakdown = Object.keys(rec.ux_analysis?.call_breakdown || {}).length > 0;

    if (hasSummary && hasBreakdown) {
      wellDocumented++;
    }
  });

  const docScore = wellDocumented / recordings.length;

  return {
    score: docScore,
    details: {
      well_documented: wellDocumented,
      missing_documentation: recordings.length - wellDocumented,
      completion_rate: (docScore * 100).toFixed(1) + "%"
    },
    status: docScore > 0.9 ? "excellent" : docScore > 0.7 ? "good" : "incomplete"
  };
}

function generateImprovementSuggestions(qualityScores: any): string[] {
  const suggestions = [];

  if (qualityScores.sample_diversity?.score < 0.7) {
    suggestions.push("Recruit more diverse participants across customer segments");
  }
  if (qualityScores.question_quality?.score < 0.7) {
    suggestions.push("Use more open-ended questions; avoid leading questions");
  }
  if (qualityScores.bias_detection?.score < 0.8) {
    suggestions.push("Review interviewer training to reduce bias");
  }
  if (qualityScores.saturation_reached?.status === "not_saturated") {
    suggestions.push("Continue research until thematic saturation is reached");
  }
  if (qualityScores.proper_documentation?.score < 0.9) {
    suggestions.push("Ensure all recordings have complete summaries and breakdowns");
  }

  if (suggestions.length === 0) {
    suggestions.push("Research quality is excellent - ready for analysis");
  }

  return suggestions;
}

function detectLeadingQuestions(transcript: string): any {
  const leadingPhrases = [
    "don't you think",
    "wouldn't you agree",
    "isn't it true that",
    "obviously",
    "clearly"
  ];

  const found = leadingPhrases.some(phrase => transcript.toLowerCase().includes(phrase));
  const examples: string[] = [];

  if (found) {
    leadingPhrases.forEach(phrase => {
      const index = transcript.toLowerCase().indexOf(phrase);
      if (index !== -1) {
        examples.push(transcript.substring(Math.max(0, index - 20), index + 50));
      }
    });
  }

  return { found, examples: examples.slice(0, 3) };
}

function detectSelectionBias(recording: any): any {
  const title = recording.title?.toLowerCase() || "";
  const indicators = [];

  if (title.includes("happy customer") || title.includes("success story")) {
    indicators.push("Potential positive selection bias");
  }

  if (title.includes("internal") || title.includes("employee")) {
    indicators.push("Sample may not represent external customers");
  }

  return {
    detected: indicators.length > 0,
    indicators
  };
}

function detectConfirmationBias(transcript: string): any {
  const confirmationPhrases = ["as expected", "this confirms", "validates our assumption"];
  const detected = confirmationPhrases.some(phrase => transcript.toLowerCase().includes(phrase));

  const examples: string[] = [];
  if (detected) {
    confirmationPhrases.forEach(phrase => {
      const index = transcript.toLowerCase().indexOf(phrase);
      if (index !== -1) {
        examples.push(transcript.substring(Math.max(0, index - 30), index + 60));
      }
    });
  }

  return { detected, examples: examples.slice(0, 2) };
}

function removeIdentifiers(text: string, preserveContext: boolean): string {
  let anonymized = text;

  // Remove company names (simple pattern matching)
  anonymized = anonymized.replace(/\b[A-Z][a-zA-Z]+ (Inc|Corp|LLC|Ltd)\b/g, "[Company]");

  // Remove personal names (capitalized words)
  anonymized = anonymized.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, "[Person]");

  // Remove email addresses
  anonymized = anonymized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[Email]");

  if (!preserveContext) {
    // Remove phone numbers
    anonymized = anonymized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[Phone]");
  }

  return anonymized;
}

function maskNames(text: string): string {
  return removeIdentifiers(text, true);
}

function anonymizeBreakdown(breakdown: any, preserveContext: boolean): any {
  const anonymized: any = {};

  Object.entries(breakdown).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      anonymized[key] = value.map((item: string) =>
        typeof item === "string" ? removeIdentifiers(item, preserveContext) : item
      );
    } else {
      anonymized[key] = value;
    }
  });

  return anonymized;
}

function generateAnonymizationKey(): string {
  return `anon_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
