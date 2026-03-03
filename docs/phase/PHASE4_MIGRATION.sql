-- ============================================================
-- PHASE 4: Customer Communication & Notification Module
-- Database Migration Script
-- ============================================================

-- ============================================================
-- Module 1: System Notifications
-- ============================================================

-- 1. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('role', 'user', 'branch')),
  target_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notification_type TEXT NOT NULL DEFAULT 'manual' CHECK (notification_type IN ('manual', 'system')),
  reference_type TEXT DEFAULT NULL,
  reference_id UUID DEFAULT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Notification receipts table (per-user read tracking)
CREATE TABLE IF NOT EXISTS notification_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ DEFAULT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_branch_id ON notifications(branch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by);
CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_type, target_value);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);

-- Indexes for notification_receipts
CREATE INDEX IF NOT EXISTS idx_notification_receipts_user ON notification_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_receipts_notification ON notification_receipts(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_receipts_unread ON notification_receipts(user_id, is_read) WHERE is_read = false;

-- Updated_at trigger for notifications
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();

-- Audit trigger for notifications
CREATE OR REPLACE FUNCTION trg_audit_notifications()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, new_values, status)
    VALUES ('CREATE', 'NOTIFICATION', NEW.id::TEXT, NEW.created_by, NEW.branch_id,
      jsonb_build_object('title', NEW.title, 'target_type', NEW.target_type, 'target_value', NEW.target_value, 'status', NEW.status),
      'SUCCESS');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, old_values, new_values, status)
    VALUES ('UPDATE', 'NOTIFICATION', NEW.id::TEXT, NEW.created_by, NEW.branch_id,
      jsonb_build_object('title', OLD.title, 'message', OLD.message, 'status', OLD.status),
      jsonb_build_object('title', NEW.title, 'message', NEW.message, 'status', NEW.status),
      'SUCCESS');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_audit
  AFTER INSERT OR UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_notifications();

-- ============================================================
-- Module 2: Service Reminder Delivery
-- ============================================================

-- Service reminders table
CREATE TABLE IF NOT EXISTS service_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  service_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'email' CHECK (delivery_method IN ('email', 'sms')),
  message_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMPTZ DEFAULT NULL,
  failure_reason TEXT DEFAULT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for service_reminders
CREATE INDEX IF NOT EXISTS idx_service_reminders_branch_id ON service_reminders(branch_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_customer_id ON service_reminders(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_vehicle_id ON service_reminders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_status ON service_reminders(status);
CREATE INDEX IF NOT EXISTS idx_service_reminders_scheduled ON service_reminders(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_service_reminders_created_by ON service_reminders(created_by);

-- Updated_at trigger for service_reminders
CREATE TRIGGER trg_service_reminders_updated_at
  BEFORE UPDATE ON service_reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();

-- Audit trigger for service_reminders
CREATE OR REPLACE FUNCTION trg_audit_service_reminders()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, new_values, status)
    VALUES ('CREATE', 'SERVICE_REMINDER', NEW.id::TEXT, NEW.created_by, NEW.branch_id,
      jsonb_build_object('customer_id', NEW.customer_id, 'vehicle_id', NEW.vehicle_id, 'service_type', NEW.service_type, 'status', NEW.status, 'delivery_method', NEW.delivery_method),
      'SUCCESS');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, old_values, new_values, status)
    VALUES ('UPDATE', 'SERVICE_REMINDER', NEW.id::TEXT, NEW.created_by, NEW.branch_id,
      jsonb_build_object('status', OLD.status, 'service_type', OLD.service_type, 'scheduled_at', OLD.scheduled_at),
      jsonb_build_object('status', NEW.status, 'service_type', NEW.service_type, 'scheduled_at', NEW.scheduled_at),
      'SUCCESS');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_service_reminders_audit
  AFTER INSERT OR UPDATE ON service_reminders
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_service_reminders();

-- ============================================================
-- RLS Policies
-- ============================================================

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_reminders ENABLE ROW LEVEL SECURITY;

-- Notifications: branch isolation
CREATE POLICY notifications_branch_isolation ON notifications
  FOR ALL
  USING (
    branch_id IN (
      SELECT uba.branch_id FROM user_branch_assignments uba WHERE uba.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'HM'
    )
  );

-- Notification receipts: user can see own receipts
CREATE POLICY notification_receipts_user_isolation ON notification_receipts
  FOR ALL
  USING (user_id = auth.uid());

-- Service reminders: branch isolation
CREATE POLICY service_reminders_branch_isolation ON service_reminders
  FOR ALL
  USING (
    branch_id IN (
      SELECT uba.branch_id FROM user_branch_assignments uba WHERE uba.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'HM'
    )
  );

-- Service role bypass (for backend admin operations)
CREATE POLICY notifications_service_role ON notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY notification_receipts_service_role ON notification_receipts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_reminders_service_role ON service_reminders
  FOR ALL
  USING (true)
  WITH CHECK (true);
