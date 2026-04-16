import { createSupabaseClient } from "../services/supabase.js";
import { logger } from "../utils/logger.js";

// Tool 35: create_research_alert
export async function createResearchAlert(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    alert_name,
    conditions,
    notification_channels = ["dashboard"],
    recipients = []
  } = args;

  logger.info("Executing createResearchAlert", { alert_name, conditions });

  try {
    const { data: alert, error } = await supabase
      .from("research_alerts")
      .insert({
        name: alert_name,
        conditions: conditions,
        notification_channels: notification_channels,
        recipients: recipients,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          alert_id: alert.id,
          alert_name: alert.name,
          status: "active",
          conditions: alert.conditions,
          notification_channels: alert.notification_channels,
          message: `Alert "${alert_name}" created successfully. You will be notified when conditions are met.`
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in createResearchAlert", error);
    throw error;
  }
}

// Tool 36: monitor_kpi_thresholds
export async function monitorKPIThresholds(args: any, scopes: string[]) {
  const supabase = createSupabaseClient();
  const {
    kpi,
    feature = null,
    threshold,
    action = "notify"
  } = args;

  logger.info("Executing monitorKPIThresholds", { kpi, threshold });

  try {
    let currentValue = 0;
    let breached = false;
    let details: any = {};

    if (kpi === "feature_request_frequency") {
      const { data, error } = await supabase
        .from("ux_insight_validations")
        .select("id, ux_analysis(call_breakdown)")
        .gte("created_at", new Date(Date.now() - threshold.timeframe * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      currentValue = data.reduce((count, insight: any) => {
        const featureRequests = insight.ux_analysis?.call_breakdown?.feature_requests || [];
        if (feature) {
          return count + (featureRequests.some((fr: string) => fr.toLowerCase().includes(feature.toLowerCase())) ? 1 : 0);
        }
        return count + featureRequests.length;
      }, 0);

      breached = currentValue >= threshold.count;
      details = {
        feature: feature || "all",
        mentions_in_period: currentValue,
        threshold: threshold.count,
        period_days: threshold.timeframe
      };
    }

    if (breached && action === "notify_product_team") {
      // Create notification record
      await supabase.from("notifications").insert({
        type: "kpi_threshold_breached",
        kpi: kpi,
        current_value: currentValue,
        threshold: threshold.count,
        details: details,
        created_at: new Date().toISOString()
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          kpi,
          threshold_breached: breached,
          current_value: currentValue,
          threshold: threshold.count,
          details,
          action_taken: breached ? action : "none"
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error("Error in monitorKPIThresholds", error);
    throw error;
  }
}

// Helper: Check active alerts
export async function checkActiveAlerts() {
  const supabase = createSupabaseClient();

  try {
    const { data: alerts, error } = await supabase
      .from("research_alerts")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;

    for (const alert of alerts) {
      const triggered = await evaluateAlertConditions(alert.conditions);

      if (triggered) {
        logger.info("Alert triggered", { alert_id: alert.id, alert_name: alert.name });

        // Send notifications
        await sendAlertNotifications(alert, triggered);

        // Log alert trigger
        await supabase.from("alert_triggers").insert({
          alert_id: alert.id,
          triggered_at: new Date().toISOString(),
          trigger_data: triggered
        });
      }
    }
  } catch (error) {
    logger.error("Error checking active alerts", error);
  }
}

async function evaluateAlertConditions(conditions: any): Promise<any | null> {
  const supabase = createSupabaseClient();

  try {
    const { pattern, frequency, timeframe, customer_segment, severity } = conditions;

    // Calculate date range
    const daysAgo = timeframe === "7_days" ? 7 : 30;
    const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    // Query matching insights
    let query = supabase
      .from("ux_insight_validations")
      .select("id, insight_type, ux_analysis(call_breakdown, recordings(id, title))")
      .gte("created_at", startDate.toISOString());

    if (pattern) {
      query = query.eq("insight_type", pattern);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Count frequency
    let count = 0;
    const examples: any[] = [];

    data.forEach((insight: any) => {
      const callBreakdown = insight.ux_analysis?.call_breakdown || {};
      const hasPattern = checkPatternMatch(pattern, callBreakdown);

      if (hasPattern) {
        count++;
        if (examples.length < 5) {
          examples.push({
            recording: insight.ux_analysis?.recordings?.title || "Unknown",
            date: insight.created_at
          });
        }
      }
    });

    // Check if frequency threshold met
    if (count >= frequency.min) {
      return {
        pattern,
        count,
        threshold: frequency.min,
        examples,
        timeframe
      };
    }

    return null;
  } catch (error) {
    logger.error("Error evaluating alert conditions", error);
    return null;
  }
}

function checkPatternMatch(pattern: string, callBreakdown: any): boolean {
  const allPatterns = [
    ...(callBreakdown.customer_pain_points || []),
    ...(callBreakdown.feature_requests || []),
    ...(callBreakdown.churn_signals || [])
  ];

  return allPatterns.some((p: string) =>
    p.toLowerCase().includes(pattern.toLowerCase())
  );
}

async function sendAlertNotifications(alert: any, triggerData: any) {
  const supabase = createSupabaseClient();

  const notification = {
    title: `Research Alert: ${alert.name}`,
    message: `Pattern "${triggerData.pattern}" detected ${triggerData.count} times (threshold: ${triggerData.threshold})`,
    type: "alert",
    data: triggerData,
    created_at: new Date().toISOString()
  };

  // Send to each notification channel
  for (const channel of alert.notification_channels) {
    if (channel === "email") {
      // Send email (integrate with email service)
      logger.info("Would send email notification", { alert: alert.name });
    } else if (channel === "slack") {
      // Send Slack message (integrate with Slack API)
      logger.info("Would send Slack notification", { alert: alert.name });
    } else if (channel === "dashboard") {
      // Create in-app notification
      await supabase.from("notifications").insert({
        ...notification,
        recipients: alert.recipients
      });
    }
  }
}
