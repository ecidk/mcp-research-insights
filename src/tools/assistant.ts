import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 43: suggest_research_questions
export async function suggestResearchQuestions(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    current_findings,
    research_goal,
    target_audience = "enterprise"
  } = args;

  logger.info("Executing suggestResearchQuestions", { research_goal, target_audience });

  try {
    // Analyze current findings to identify gaps
    const knowledgeAreas = analyzeKnowledgeCoverage(current_findings);

    // Generate targeted questions based on research goal
    const questions: Array<{
      question: string;
      priority: string;
      rationale: string;
      target: string;
    }> = [];

    if (research_goal === "understand_churn") {
      questions.push({
        question: "What was the last straw that led to your decision to leave?",
        priority: "critical",
        rationale: "Identifies immediate triggers for churn",
        target: "churned_customers"
      });

      questions.push({
        question: "What alternatives did you evaluate before deciding to churn?",
        priority: "high",
        rationale: "Reveals competitive positioning issues",
        target: "churned_customers"
      });

      questions.push({
        question: "If we could change one thing to win you back, what would it be?",
        priority: "high",
        rationale: "Prioritizes win-back efforts",
        target: "churned_customers"
      });

      if (!knowledgeAreas.pricing_concerns) {
        questions.push({
          question: "Did pricing play a role in your decision?",
          priority: "medium",
          rationale: "Gap detected: no pricing data in current findings",
          target: "churned_customers"
        });
      }

      if (!knowledgeAreas.support_experience) {
        questions.push({
          question: "How would you rate your support experience?",
          priority: "medium",
          rationale: "Gap detected: support quality not covered",
          target: "churned_customers"
        });
      }
    } else if (research_goal === "validate_feature") {
      questions.push({
        question: "How would this feature fit into your daily workflow?",
        priority: "critical",
        rationale: "Validates product-market fit",
        target: target_audience
      });

      questions.push({
        question: "What problem does this solve for you that current solutions don't?",
        priority: "critical",
        rationale: "Tests differentiation hypothesis",
        target: target_audience
      });

      questions.push({
        question: "How much time would this save you per week?",
        priority: "high",
        rationale: "Quantifies value proposition",
        target: target_audience
      });

      questions.push({
        question: "Who else on your team would use this?",
        priority: "medium",
        rationale: "Assesses expansion potential",
        target: target_audience
      });
    } else if (research_goal === "improve_onboarding") {
      questions.push({
        question: "At what point in setup did you first feel confused or stuck?",
        priority: "critical",
        rationale: "Identifies friction points",
        target: "new_users"
      });

      questions.push({
        question: "What documentation or guidance were you looking for but couldn't find?",
        priority: "high",
        rationale: "Reveals content gaps",
        target: "new_users"
      });

      questions.push({
        question: "How long did it take you to achieve your first meaningful outcome?",
        priority: "high",
        rationale: "Measures time-to-value",
        target: "new_users"
      });

      if (!knowledgeAreas.expectations_vs_reality) {
        questions.push({
          question: "How did the product compare to your expectations from the sales process?",
          priority: "medium",
          rationale: "Gap detected: expectation alignment not assessed",
          target: "new_users"
        });
      }
    }

    // Sort by priority
    const priorityOrder: any = { critical: 0, high: 1, medium: 2, low: 3 };
    questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          research_goal,
          target_audience,
          knowledge_gaps_detected: Object.keys(knowledgeAreas).filter(k => !knowledgeAreas[k]).length,
          suggested_questions: questions,
          research_plan: {
            sample_size_recommended: target_audience === "enterprise" ? 15 : 30,
            interview_duration: "30-45 minutes",
            key_focus: research_goal === "understand_churn" ? "emotional triggers and alternatives" :
                      research_goal === "validate_feature" ? "workflow fit and value" :
                      "friction points and success moments"
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in suggestResearchQuestions", error);
    throw error;
  }
}

// Tool 44: identify_knowledge_gaps
export async function identifyKnowledgeGaps(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    topic,
    compared_to = "industry_benchmarks"
  } = args;

  logger.info("Executing identifyKnowledgeGaps", { topic, compared_to });

  try {
    // Fetch current insights on this topic
    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_type,
        ux_analysis(
          comprehensive_summary,
          call_breakdown
        )
      `);

    if (error) throw error;

    // Filter by topic
    const topicInsights = insights.filter((insight: any) => {
      const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
      return summary.includes(topic.toLowerCase());
    });

    // Analyze coverage
    const coverage = {
      total_insights: topicInsights.length,
      call_types: new Set<string>(),
      aspects_covered: {
        pain_points: false,
        feature_requests: false,
        workflow: false,
        alternatives: false,
        pricing: false,
        support: false
      }
    };

    topicInsights.forEach((insight: any) => {
      const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
      const breakdown = insight.ux_analysis?.call_breakdown || {};

      coverage.call_types.add(insight.insight_type);

      if (breakdown.customer_pain_points?.length > 0) coverage.aspects_covered.pain_points = true;
      if (breakdown.feature_requests?.length > 0) coverage.aspects_covered.feature_requests = true;
      if (summary.includes("workflow") || summary.includes("process")) coverage.aspects_covered.workflow = true;
      if (summary.includes("alternative") || summary.includes("competitor")) coverage.aspects_covered.alternatives = true;
      if (summary.includes("pricing") || summary.includes("cost")) coverage.aspects_covered.pricing = true;
      if (summary.includes("support") || summary.includes("help")) coverage.aspects_covered.support = true;
    });

    // Identify gaps
    const gaps: Array<{
      area: string;
      severity: string;
      recommendation: string;
    }> = [];

    Object.entries(coverage.aspects_covered).forEach(([aspect, covered]) => {
      if (!covered) {
        gaps.push({
          area: aspect,
          severity: aspect === "pain_points" || aspect === "workflow" ? "high" : "medium",
          recommendation: `Conduct interviews specifically focused on ${aspect.replace('_', ' ')}`
        });
      }
    });

    if (coverage.call_types.size < 3) {
      gaps.push({
        area: "call_type_diversity",
        severity: "medium",
        recommendation: "Gather insights from diverse call types (discovery, support, onboarding, etc.)"
      });
    }

    if (coverage.total_insights < 10) {
      gaps.push({
        area: "sample_size",
        severity: "high",
        recommendation: `Only ${coverage.total_insights} insights on this topic - need at least 10 more for statistical validity`
      });
    }

    // Industry benchmark comparison (if requested)
    let benchmarkComparison = null;
    if (compared_to === "industry_benchmarks") {
      benchmarkComparison = {
        typical_insight_count: 30,
        your_insight_count: coverage.total_insights,
        gap: 30 - coverage.total_insights,
        status: coverage.total_insights >= 30 ? "above_benchmark" :
                coverage.total_insights >= 15 ? "at_benchmark" :
                "below_benchmark"
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          topic,
          current_coverage: {
            total_insights: coverage.total_insights,
            call_types: Array.from(coverage.call_types),
            aspects_covered: Object.entries(coverage.aspects_covered)
              .filter(([_, covered]) => covered)
              .map(([aspect]) => aspect),
            aspects_missing: Object.entries(coverage.aspects_covered)
              .filter(([_, covered]) => !covered)
              .map(([aspect]) => aspect)
          },
          knowledge_gaps: gaps.sort((a, b) => {
            const severityOrder: any = { high: 0, medium: 1, low: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
          }),
          benchmark_comparison: benchmarkComparison,
          next_steps: [
            gaps.length > 0 ? `Prioritize filling ${gaps[0].area} gap` : "Coverage is comprehensive",
            "Schedule 5-10 additional interviews",
            "Review existing recordings for missed aspects"
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in identifyKnowledgeGaps", error);
    throw error;
  }
}

// Tool 45: test_hypothesis
export async function testHypothesis(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    hypothesis,
    null_hypothesis,
    confidence_level = 0.95,
    sample_size_min = 30
  } = args;

  logger.info("Executing testHypothesis", { hypothesis, confidence_level });

  try {
    // Parse hypothesis to extract testable components
    const components = parseHypothesis(hypothesis);

    // Fetch relevant data
    const { data: insights, error } = await supabase
      .from("ux_insight_validations")
      .select(`
        id,
        insight_type,
        ux_analysis(
          comprehensive_summary,
          call_breakdown,
          recordings(title)
        )
      `);

    if (error) throw error;

    // Segment data based on hypothesis
    const groupA = insights.filter((insight: any) => matchesGroup(insight, components.groupA));
    const groupB = insights.filter((insight: any) => matchesGroup(insight, components.groupB));

    // Check sample size
    if (groupA.length < sample_size_min || groupB.length < sample_size_min) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            hypothesis,
            test_status: "insufficient_data",
            sample_sizes: {
              group_a: groupA.length,
              group_b: groupB.length,
              required_min: sample_size_min
            },
            recommendation: `Need ${Math.max(sample_size_min - groupA.length, sample_size_min - groupB.length)} more samples`
          }, null, 2)
        }]
      };
    }

    // Measure the metric mentioned in hypothesis
    const metricA = measureMetric(groupA, components.metric);
    const metricB = measureMetric(groupB, components.metric);

    // Calculate statistics
    const meanA = metricA.reduce((sum, v) => sum + v, 0) / metricA.length;
    const meanB = metricB.reduce((sum, v) => sum + v, 0) / metricB.length;
    const stdDevA = calculateStdDev(metricA);
    const stdDevB = calculateStdDev(metricB);

    // Simple t-test
    const pooledStdDev = Math.sqrt(
      ((metricA.length - 1) * stdDevA ** 2 + (metricB.length - 1) * stdDevB ** 2) /
      (metricA.length + metricB.length - 2)
    );

    const tStatistic = (meanA - meanB) / (pooledStdDev * Math.sqrt(1 / metricA.length + 1 / metricB.length));
    const degreesOfFreedom = metricA.length + metricB.length - 2;

    // Critical value for 95% confidence (approximation)
    const criticalValue = confidence_level === 0.95 ? 1.96 : confidence_level === 0.99 ? 2.576 : 1.645;
    const isSignificant = Math.abs(tStatistic) > criticalValue;

    // Calculate effect size (Cohen's d)
    const effectSize = (meanA - meanB) / pooledStdDev;
    const effectMagnitude = Math.abs(effectSize) < 0.2 ? "negligible" :
                            Math.abs(effectSize) < 0.5 ? "small" :
                            Math.abs(effectSize) < 0.8 ? "medium" : "large";

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          hypothesis,
          null_hypothesis,
          test_results: {
            statistically_significant: isSignificant,
            p_value: isSignificant ? "< 0.05" : "> 0.05",
            confidence_level: confidence_level,
            t_statistic: tStatistic.toFixed(3),
            degrees_of_freedom: degreesOfFreedom
          },
          group_statistics: {
            group_a: {
              name: components.groupA,
              sample_size: groupA.length,
              mean: meanA.toFixed(2),
              std_dev: stdDevA.toFixed(2)
            },
            group_b: {
              name: components.groupB,
              sample_size: groupB.length,
              mean: meanB.toFixed(2),
              std_dev: stdDevB.toFixed(2)
            }
          },
          effect_size: {
            cohens_d: effectSize.toFixed(3),
            magnitude: effectMagnitude,
            interpretation: effectMagnitude === "large" ? "Strong practical significance" :
                           effectMagnitude === "medium" ? "Moderate practical significance" :
                           "Limited practical significance"
          },
          conclusion: isSignificant
            ? `REJECT null hypothesis. ${hypothesis} is supported by data (${confidence_level * 100}% confidence)`
            : `FAIL TO REJECT null hypothesis. Insufficient evidence to support: ${hypothesis}`,
          recommendations: [
            isSignificant ? "Act on this finding with high confidence" : "Gather more data before acting",
            effectMagnitude === "large" || effectMagnitude === "medium" ? "Prioritize this insight" : "May not be actionable",
            `Consider follow-up research to explore why ${components.groupA} differs from ${components.groupB}`
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in testHypothesis", error);
    throw error;
  }
}

// Tool 46: calculate_sample_size
export async function calculateSampleSize(args: any, scopes: string[]) {
  const {
    effect_size = "medium",
    confidence_level = 0.95,
    power = 0.8
  } = args;

  logger.info("Executing calculateSampleSize", { effect_size, confidence_level, power });

  try {
    // Cohen's d values
    const effectSizes: any = {
      small: 0.2,
      medium: 0.5,
      large: 0.8
    };

    const d = effectSizes[effect_size] || 0.5;

    // Z-scores for confidence levels
    const zAlpha = confidence_level === 0.95 ? 1.96 : confidence_level === 0.99 ? 2.576 : 1.645;
    const zBeta = power === 0.8 ? 0.84 : power === 0.9 ? 1.28 : 0.52;

    // Sample size calculation per group (approximation)
    const n = Math.ceil(
      2 * Math.pow((zAlpha + zBeta) / d, 2)
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          parameters: {
            effect_size: effect_size + ` (Cohen's d = ${d})`,
            confidence_level: (confidence_level * 100) + "%",
            statistical_power: (power * 100) + "%"
          },
          required_sample_size: {
            per_group: n,
            total: n * 2,
            interpretation: n < 30 ? "Small study" : n < 100 ? "Medium study" : "Large study"
          },
          practical_guidance: {
            minimum_interviews: n,
            recommended_buffer: Math.ceil(n * 1.2), // 20% buffer
            rationale: `With ${n} samples per group, you have ${power * 100}% chance of detecting a ${effect_size} effect at ${confidence_level * 100}% confidence`
          },
          time_estimate: {
            if_1_interview_per_day: `${n} days per group`,
            if_3_interviews_per_week: `${Math.ceil(n / 3)} weeks per group`,
            total_project_duration: `${Math.ceil((n * 2) / 15)} months (assuming 15 interviews/month)`
          },
          alternatives: [
            {
              scenario: "Faster timeline",
              adjustment: "Increase to large effect size",
              new_sample_size: Math.ceil(2 * Math.pow((zAlpha + zBeta) / 0.8, 2)),
              tradeoff: "Will only detect large effects"
            },
            {
              scenario: "Higher confidence",
              adjustment: "Increase confidence to 99%",
              new_sample_size: Math.ceil(2 * Math.pow((2.576 + zBeta) / d, 2)),
              tradeoff: "Requires more participants"
            }
          ]
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in calculateSampleSize", error);
    throw error;
  }
}

// Helper functions
function analyzeKnowledgeCoverage(findings: string[]): any {
  const coverage: any = {
    pricing_concerns: false,
    support_experience: false,
    feature_requests: false,
    workflow_fit: false,
    expectations_vs_reality: false
  };

  findings.forEach(finding => {
    const lower = finding.toLowerCase();
    if (lower.includes("pricing") || lower.includes("cost")) coverage.pricing_concerns = true;
    if (lower.includes("support") || lower.includes("help")) coverage.support_experience = true;
    if (lower.includes("feature") || lower.includes("request")) coverage.feature_requests = true;
    if (lower.includes("workflow") || lower.includes("process")) coverage.workflow_fit = true;
    if (lower.includes("expect") || lower.includes("thought")) coverage.expectations_vs_reality = true;
  });

  return coverage;
}

function parseHypothesis(hypothesis: string): any {
  // Example: "Enterprise customers mention integration issues more than SMBs"
  const lower = hypothesis.toLowerCase();

  let groupA = "enterprise";
  let groupB = "smb";
  let metric = "integration_mentions";

  if (lower.includes("enterprise") && lower.includes("smb")) {
    groupA = "enterprise";
    groupB = "smb";
  }

  if (lower.includes("integration")) metric = "integration_mentions";
  if (lower.includes("pricing") || lower.includes("cost")) metric = "pricing_concerns";
  if (lower.includes("support")) metric = "support_issues";
  if (lower.includes("feature")) metric = "feature_requests";

  return { groupA, groupB, metric };
}

function matchesGroup(insight: any, groupName: string): boolean {
  const title = insight.ux_analysis?.recordings?.title?.toLowerCase() || "";
  const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
  const text = title + " " + summary;

  return text.includes(groupName.toLowerCase());
}

function measureMetric(insights: any[], metric: string): number[] {
  return insights.map(insight => {
    const summary = insight.ux_analysis?.comprehensive_summary?.toLowerCase() || "";
    const breakdown = insight.ux_analysis?.call_breakdown || {};

    if (metric === "integration_mentions") {
      const integrationCount = (breakdown.feature_requests || [])
        .filter((fr: string) => fr.toLowerCase().includes("integration")).length;
      return integrationCount;
    }

    if (metric === "pricing_concerns") {
      return summary.includes("pricing") || summary.includes("cost") ? 1 : 0;
    }

    if (metric === "support_issues") {
      return (breakdown.customer_pain_points || [])
        .filter((pp: string) => pp.toLowerCase().includes("support")).length;
    }

    if (metric === "feature_requests") {
      return (breakdown.feature_requests || []).length;
    }

    return 0;
  });
}

function calculateStdDev(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(variance);
}
