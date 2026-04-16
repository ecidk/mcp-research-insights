-- ============================================================================
-- Phase 2 Enhancements - Research & Insights MCP Server
-- Migration: 002_phase2_enhancements.sql
-- Description: Adds tables for 51 new tools across workflow, analytics, collaboration, integrations, and quality
-- ============================================================================

-- ========== Workflow Automation Tables ==========

-- Table: recording_tags
-- For auto-tagging and batch tagging functionality
CREATE TABLE IF NOT EXISTS recording_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'call_type', 'sentiment', 'product_area', 'customer_segment'
  value TEXT NOT NULL,
  confidence_score FLOAT DEFAULT 1.0,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id),
  UNIQUE(recording_id, category)
);

CREATE INDEX idx_recording_tags_recording ON recording_tags(recording_id);
CREATE INDEX idx_recording_tags_category ON recording_tags(category);
CREATE INDEX idx_recording_tags_value ON recording_tags(value);

-- ========== Alert & Monitoring Tables ==========

-- Table: research_alerts
-- For proactive pattern detection and notifications
CREATE TABLE IF NOT EXISTS research_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  conditions JSONB NOT NULL, -- { pattern, frequency, timeframe, customer_segment, severity }
  notification_channels TEXT[] DEFAULT ARRAY['dashboard'], -- 'email', 'slack', 'dashboard'
  recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ
);

CREATE INDEX idx_research_alerts_active ON research_alerts(is_active);
CREATE INDEX idx_research_alerts_created_by ON research_alerts(created_by);

-- Table: alert_triggers
-- Log of when alerts fired
CREATE TABLE IF NOT EXISTS alert_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES research_alerts(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  trigger_data JSONB NOT NULL, -- { pattern, count, threshold, examples, timeframe }
  notified_users TEXT[]
);

CREATE INDEX idx_alert_triggers_alert ON alert_triggers(alert_id);
CREATE INDEX idx_alert_triggers_date ON alert_triggers(triggered_at);

-- Table: notifications
-- In-app notifications for alerts and mentions
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'alert', 'kpi_threshold_breached', 'research_note_mention'
  title TEXT NOT NULL,
  message TEXT,
  reference_id UUID,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_date ON notifications(created_at);

-- ========== Report & Filter Tables ==========

-- Table: saved_search_filters
-- Save complex filter combinations
CREATE TABLE IF NOT EXISTS saved_search_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL, -- Saved filter configuration
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_saved_filters_user ON saved_search_filters(created_by);
CREATE INDEX idx_saved_filters_name ON saved_search_filters(name);

-- ========== Collaboration Tables ==========

-- Table: research_snapshots
-- Save and share research snapshots
CREATE TABLE IF NOT EXISTS research_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  filters JSONB, -- Filters used to create snapshot
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  shared_with TEXT[] DEFAULT ARRAY[]::TEXT[], -- User IDs or team names
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_research_snapshots_created_by ON research_snapshots(created_by);
CREATE INDEX idx_research_snapshots_tags ON research_snapshots USING GIN(tags);
CREATE INDEX idx_research_snapshots_created_at ON research_snapshots(created_at);

-- Table: research_snapshot_items
-- Many-to-many relationship between snapshots and insights
CREATE TABLE IF NOT EXISTS research_snapshot_items (
  snapshot_id UUID NOT NULL REFERENCES research_snapshots(id) ON DELETE CASCADE,
  insight_id UUID NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (snapshot_id, insight_id)
);

CREATE INDEX idx_snapshot_items_snapshot ON research_snapshot_items(snapshot_id);
CREATE INDEX idx_snapshot_items_insight ON research_snapshot_items(insight_id);

-- Table: research_notes
-- Team annotations on insights
CREATE TABLE IF NOT EXISTS research_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id UUID NOT NULL,
  note_type TEXT NOT NULL, -- 'hypothesis', 'question', 'observation', 'action_item'
  content TEXT NOT NULL,
  mentioned_users TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_resolved BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_research_notes_insight ON research_notes(insight_id);
CREATE INDEX idx_research_notes_type ON research_notes(note_type);
CREATE INDEX idx_research_notes_resolved ON research_notes(is_resolved);
CREATE INDEX idx_research_notes_created_by ON research_notes(created_by);

-- ========== Integration Tables ==========

-- Table: integration_syncs
-- Track syncs to external systems (Jira, ProductBoard, Salesforce)
CREATE TABLE IF NOT EXISTS integration_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type TEXT NOT NULL, -- 'jira', 'productboard', 'salesforce'
  external_id TEXT, -- ID in external system
  feature_request TEXT,
  sync_data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  synced_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' -- 'pending', 'success', 'failed'
);

CREATE INDEX idx_integration_syncs_type ON integration_syncs(integration_type);
CREATE INDEX idx_integration_syncs_date ON integration_syncs(synced_at);
CREATE INDEX idx_integration_syncs_external ON integration_syncs(external_id);

-- Table: salesforce_enrichments
-- Cache of Salesforce account enrichments
CREATE TABLE IF NOT EXISTS salesforce_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL UNIQUE,
  enrichment_data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  synced_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_salesforce_enrichments_account ON salesforce_enrichments(account_id);
CREATE INDEX idx_salesforce_enrichments_date ON salesforce_enrichments(synced_at);

-- ========== Quality & Compliance Tables ==========

-- Table: data_access_logs
-- Audit trail of who accessed what insights
CREATE TABLE IF NOT EXISTS data_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- 'view', 'export', 'edit', 'delete'
  resource_type TEXT NOT NULL, -- 'insight', 'recording', 'snapshot'
  resource_id UUID NOT NULL,
  metadata JSONB, -- { format, contains_pii, ip_address }
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_access_logs_user ON data_access_logs(user_id);
CREATE INDEX idx_data_access_logs_date ON data_access_logs(accessed_at);
CREATE INDEX idx_data_access_logs_resource ON data_access_logs(resource_type, resource_id);
CREATE INDEX idx_data_access_logs_action ON data_access_logs(action_type);

-- Table: anonymized_insights
-- Store anonymized versions of insights for external sharing
CREATE TABLE IF NOT EXISTS anonymized_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_insight_id UUID NOT NULL,
  anonymized_data JSONB NOT NULL,
  anonymization_level TEXT NOT NULL, -- 'partial', 'full'
  anonymization_key TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anonymized_insights_original ON anonymized_insights(original_insight_id);
CREATE INDEX idx_anonymized_insights_key ON anonymized_insights(anonymization_key);

-- Table: research_quality_scores
-- Cache quality assessment results
CREATE TABLE IF NOT EXISTS research_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  overall_score FLOAT NOT NULL,
  criteria_scores JSONB NOT NULL, -- { sample_diversity, question_quality, bias_detection, etc. }
  assessment_date TIMESTAMPTZ DEFAULT NOW(),
  assessed_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_quality_scores_recording ON research_quality_scores(recording_id);
CREATE INDEX idx_quality_scores_overall ON research_quality_scores(overall_score);

-- ========== Analytics Support Tables ==========

-- Table: pattern_tracking
-- Cache recurring pattern analysis results
CREATE TABLE IF NOT EXISTS pattern_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL, -- 'pain_points', 'feature_requests', 'objections', 'praise'
  frequency INTEGER NOT NULL,
  timeframe TEXT NOT NULL,
  examples JSONB,
  affected_customers TEXT[],
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pattern_tracking_pattern ON pattern_tracking(pattern);
CREATE INDEX idx_pattern_tracking_type ON pattern_tracking(pattern_type);
CREATE INDEX idx_pattern_tracking_frequency ON pattern_tracking(frequency);
CREATE INDEX idx_pattern_tracking_timeframe ON pattern_tracking(timeframe);

-- Table: cohort_analysis_cache
-- Cache cohort comparison results for performance
CREATE TABLE IF NOT EXISTS cohort_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_a_name TEXT NOT NULL,
  cohort_b_name TEXT NOT NULL,
  cohort_a_filters JSONB NOT NULL,
  cohort_b_filters JSONB NOT NULL,
  analysis_results JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX idx_cohort_cache_names ON cohort_analysis_cache(cohort_a_name, cohort_b_name);
CREATE INDEX idx_cohort_cache_expires ON cohort_analysis_cache(expires_at);

-- ========== Row Level Security Policies ==========

-- Enable RLS on all new tables
ALTER TABLE recording_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_search_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_snapshot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE salesforce_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymized_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_quality_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_analysis_cache ENABLE ROW LEVEL SECURITY;

-- Policies: Allow authenticated users to read/write their own data
CREATE POLICY "Users can view their own tags" ON recording_tags
  FOR SELECT USING (auth.uid() = applied_by OR applied_by IS NULL);

CREATE POLICY "Users can create tags" ON recording_tags
  FOR INSERT WITH CHECK (auth.uid() = applied_by);

CREATE POLICY "Users can view their alerts" ON research_alerts
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can manage their alerts" ON research_alerts
  FOR ALL USING (auth.uid() = created_by);

CREATE POLICY "Users can view their notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their saved filters" ON saved_search_filters
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can manage their filters" ON saved_search_filters
  FOR ALL USING (auth.uid() = created_by);

CREATE POLICY "Users can view shared snapshots" ON research_snapshots
  FOR SELECT USING (
    auth.uid()::TEXT = ANY(shared_with) OR
    auth.uid() = created_by OR
    'public' = ANY(shared_with)
  );

CREATE POLICY "Users can manage their snapshots" ON research_snapshots
  FOR ALL USING (auth.uid() = created_by);

CREATE POLICY "Users can view research notes" ON research_notes
  FOR SELECT USING (true); -- All authenticated users can read

CREATE POLICY "Users can create research notes" ON research_notes
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their notes" ON research_notes
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Admins can view all data access logs" ON data_access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'compliance_officer')
    )
  );

CREATE POLICY "Users can view anonymized insights" ON anonymized_insights
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can view quality scores" ON research_quality_scores
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can view patterns" ON pattern_tracking
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can view cohort cache" ON cohort_analysis_cache
  FOR SELECT USING (true);

-- ========== Functions & Triggers ==========

-- Function: Auto-expire old cohort analysis cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cohort_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM cohort_analysis_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function: Log data access for compliance
CREATE OR REPLACE FUNCTION log_data_access(
  p_user_id UUID,
  p_action_type TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS void AS $$
BEGIN
  INSERT INTO data_access_logs (user_id, action_type, resource_type, resource_id, metadata)
  VALUES (p_user_id, p_action_type, p_resource_type, p_resource_id, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Update last_used_at on saved filters
CREATE OR REPLACE FUNCTION update_filter_last_used()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE saved_search_filters
  SET last_used_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update filter usage timestamp (if needed in application)
-- Note: This would be triggered by application logic, not directly by SELECT

-- Function: Get pattern trend analysis
CREATE OR REPLACE FUNCTION get_pattern_trend(
  p_pattern TEXT,
  p_pattern_type TEXT,
  p_periods TEXT[]
)
RETURNS TABLE (
  period TEXT,
  frequency INTEGER,
  change_from_previous INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.timeframe,
    pt.frequency,
    COALESCE(
      pt.frequency - LAG(pt.frequency) OVER (ORDER BY pt.created_at),
      0
    ) as change_from_previous
  FROM pattern_tracking pt
  WHERE pt.pattern = p_pattern
    AND pt.pattern_type = p_pattern_type
    AND pt.timeframe = ANY(p_periods)
  ORDER BY pt.created_at;
END;
$$ LANGUAGE plpgsql;

-- ========== Indexes for Performance ==========

-- Additional composite indexes for common queries
CREATE INDEX idx_recording_tags_recording_category ON recording_tags(recording_id, category);
CREATE INDEX idx_research_notes_insight_type ON research_notes(insight_id, note_type);
CREATE INDEX idx_research_notes_unresolved ON research_notes(is_resolved, note_type) WHERE is_resolved = FALSE;
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at) WHERE is_read = FALSE;
CREATE INDEX idx_pattern_tracking_type_freq ON pattern_tracking(pattern_type, frequency DESC);

-- ========== Comments for Documentation ==========

COMMENT ON TABLE recording_tags IS 'Auto-generated and manual tags for recordings (Tool #19, #20)';
COMMENT ON TABLE research_alerts IS 'Proactive alerts for pattern detection (Tool #35)';
COMMENT ON TABLE saved_search_filters IS 'Saved search filter combinations (Tool #51, #52)';
COMMENT ON TABLE research_snapshots IS 'Saved research snapshots for sharing (Tool #27)';
COMMENT ON TABLE research_notes IS 'Team annotations on insights (Tool #29, #30)';
COMMENT ON TABLE integration_syncs IS 'Integration logs for Jira, ProductBoard, Salesforce (Tool #39, #40, #41)';
COMMENT ON TABLE data_access_logs IS 'Audit trail for compliance (Tool #49)';
COMMENT ON TABLE anonymized_insights IS 'Anonymized insights for external sharing (Tool #50)';
COMMENT ON TABLE research_quality_scores IS 'Research quality assessments (Tool #47, #48)';
COMMENT ON TABLE pattern_tracking IS 'Cached recurring pattern analysis (Tool #23, #24)';
COMMENT ON TABLE cohort_analysis_cache IS 'Cached cohort comparison results (Tool #31, #32)';

-- ========== Grants ==========

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON recording_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON research_alerts TO authenticated;
GRANT SELECT, INSERT ON alert_triggers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_search_filters TO authenticated;
GRANT SELECT, INSERT, UPDATE ON research_snapshots TO authenticated;
GRANT SELECT, INSERT ON research_snapshot_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON research_notes TO authenticated;
GRANT SELECT, INSERT ON integration_syncs TO authenticated;
GRANT SELECT ON salesforce_enrichments TO authenticated;
GRANT SELECT ON data_access_logs TO authenticated;
GRANT SELECT ON anonymized_insights TO authenticated;
GRANT SELECT ON research_quality_scores TO authenticated;
GRANT SELECT ON pattern_tracking TO authenticated;
GRANT SELECT ON cohort_analysis_cache TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================
