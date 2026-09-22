-- 007: CRM document sections 2.6 (country / document / university / course
-- configuration) and 2.7 (communication and automation control).
--
-- Additive only. Nothing is dropped and nothing is rewritten. Fly Masters has
-- five years of live data; every statement here creates something new or adds
-- a column with a safe default.
--
-- Design note that matters for anyone extending this file: unlike the legacy
-- data, these are REAL tables, not JSONB blobs inside app_records. This is
-- configuration that gets queried, joined, versioned and audited. Migrations
-- 004 and 005 both had to be written because a column was added to a
-- sensibly-named table while the app read from the blob store; none of the
-- tables below have that problem because nothing else reads them.
--
-- Versioning rule, stated once and enforced everywhere below:
--   nothing is ever deleted. A superseded version keeps its row and moves to
--   status 'inactive'. The live version is the one row with status 'active'.
--   config_change_log records what changed between them.

-- ---------------------------------------------------------------------------
-- 2.6 — document master
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_master (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  accepted_formats    TEXT[] NOT NULL DEFAULT ARRAY['pdf'],
  max_size_mb         NUMERIC(6,2) NOT NULL DEFAULT 20,
  naming_convention   TEXT NOT NULL DEFAULT '',
  requires_expiry     BOOLEAN NOT NULL DEFAULT false,
  validity_months     INTEGER,
  sample_instructions TEXT NOT NULL DEFAULT '',
  review_instructions TEXT NOT NULL DEFAULT '',
  country_scope       TEXT[] NOT NULL DEFAULT ARRAY['All'],
  restricted_visible  BOOLEAN NOT NULL DEFAULT false,
  retention_days      INTEGER,
  secure_download     BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_master_active ON document_master(is_active);

-- Rejection reasons and additional-document request templates (2.6 bullet 5).
CREATE TABLE IF NOT EXISTS document_reason_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('rejection', 'request', 'approval_rule')),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, code)
);

-- ---------------------------------------------------------------------------
-- 2.6 — the status vocabulary the Super Admin owns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS status_vocabulary (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN
                  ('document', 'application', 'visa', 'commission_visibility', 'next_step')),
  code          TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT 'slate',
  icon          TEXT NOT NULL DEFAULT '',
  stage_index   INTEGER NOT NULL DEFAULT 0,
  is_terminal   BOOLEAN NOT NULL DEFAULT false,
  visible_to    TEXT[] NOT NULL DEFAULT ARRAY['staff','student','partner'],
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, code)
);
CREATE INDEX IF NOT EXISTS idx_status_vocab_kind ON status_vocabulary(kind, stage_index);

-- ---------------------------------------------------------------------------
-- 2.6 — versioned country checklists
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS checklist_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID NOT NULL,           -- stable across versions
  name              TEXT NOT NULL,
  country           TEXT NOT NULL DEFAULT 'All',
  application_stage TEXT NOT NULL DEFAULT 'All',
  visa_stage        TEXT NOT NULL DEFAULT 'All',
  course_level      TEXT NOT NULL DEFAULT 'All',
  intake            TEXT NOT NULL DEFAULT 'All',
  institution_type  TEXT NOT NULL DEFAULT 'All',
  version           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'inactive')),
  change_note       TEXT NOT NULL DEFAULT '',
  published_at      TIMESTAMPTZ,
  superseded_by     UUID REFERENCES checklist_templates(id),
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, version)
);
CREATE INDEX IF NOT EXISTS idx_checklist_tpl_family ON checklist_templates(family_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_tpl_live ON checklist_templates(status, country);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  document_master_id UUID NOT NULL REFERENCES document_master(id),
  requirement        TEXT NOT NULL DEFAULT 'mandatory'
                       CHECK (requirement IN ('mandatory','optional','conditional','time_sensitive')),
  condition_note     TEXT NOT NULL DEFAULT '',
  requires_expiry    BOOLEAN NOT NULL DEFAULT false,
  display_order      INTEGER NOT NULL DEFAULT 99,
  UNIQUE (template_id, document_master_id)
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_tpl ON checklist_template_items(template_id, display_order);

-- ---------------------------------------------------------------------------
-- 2.6 — a student's activated checklist, pinned to the version in force
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS student_checklists (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     TEXT NOT NULL,
  template_id    UUID NOT NULL REFERENCES checklist_templates(id),
  family_id      UUID NOT NULL,
  country        TEXT NOT NULL,
  branch_id      UUID REFERENCES branches(id),
  activated_by   TEXT,
  activated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (student_id, family_id)
);
CREATE INDEX IF NOT EXISTS idx_student_checklists_student ON student_checklists(student_id);

CREATE TABLE IF NOT EXISTS student_checklist_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_checklist_id  UUID NOT NULL REFERENCES student_checklists(id) ON DELETE CASCADE,
  document_master_id    UUID NOT NULL REFERENCES document_master(id),
  requirement           TEXT NOT NULL DEFAULT 'mandatory',
  status_code           TEXT NOT NULL DEFAULT 'pending',
  next_step_note        TEXT NOT NULL DEFAULT '',
  rejection_reason      TEXT NOT NULL DEFAULT '',
  document_record_id    TEXT,
  expires_on            DATE,
  -- cross-country duplicate handling (2.6, bullet 4): when the same document
  -- is already accepted on another country's checklist, this points at that
  -- item instead of asking the student to upload it twice.
  satisfied_by_item_id  UUID REFERENCES student_checklist_items(id),
  updated_by            TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_checklist_id, document_master_id)
);
CREATE INDEX IF NOT EXISTS idx_student_items_list ON student_checklist_items(student_checklist_id);
CREATE INDEX IF NOT EXISTS idx_student_items_doc ON student_checklist_items(document_master_id);

-- ---------------------------------------------------------------------------
-- Developer-only change tracking (client asked to see what changed, and from
-- when, without exposing it to every staff member)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS config_change_log (
  id            BIGSERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  entity_label  TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL,
  version_from  INTEGER,
  version_to    INTEGER,
  diff          JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id      TEXT,
  actor_name    TEXT,
  actor_role    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_config_log_entity ON config_change_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_log_time ON config_change_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2.6.1 — configurable sound and visual alerts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alert_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type     TEXT NOT NULL CHECK (scope_type IN ('global','branch','role','user')),
  scope_id       TEXT NOT NULL DEFAULT '*',
  alert_type     TEXT NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  sound_enabled  BOOLEAN NOT NULL DEFAULT true,
  tone           TEXT NOT NULL DEFAULT 'chime',
  repeat_count   INTEGER NOT NULL DEFAULT 1,
  priority       TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  channels       TEXT[] NOT NULL DEFAULT ARRAY['bell','toast'],
  color          TEXT NOT NULL DEFAULT 'sky',
  display_ms     INTEGER NOT NULL DEFAULT 6000,
  can_snooze     BOOLEAN NOT NULL DEFAULT true,
  can_mute       BOOLEAN NOT NULL DEFAULT true,
  quiet_start    TIME,
  quiet_end      TIME,
  respect_hours  BOOLEAN NOT NULL DEFAULT true,
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id, alert_type)
);

CREATE TABLE IF NOT EXISTS alert_queue (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  branch_id    UUID,
  alert_type   TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  link         TEXT NOT NULL DEFAULT '',
  priority     TEXT NOT NULL DEFAULT 'normal',
  sound        TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT 'sky',
  display_ms   INTEGER NOT NULL DEFAULT 6000,
  entity_type  TEXT NOT NULL DEFAULT '',
  entity_id    TEXT NOT NULL DEFAULT '',
  delivered_at TIMESTAMPTZ,
  read_at      TIMESTAMPTZ,
  snoozed_to   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_queue_user ON alert_queue(user_id, read_at, created_at DESC);

-- Availability / working hours, so alert rules can respect them (2.6.1 last bullet).
CREATE TABLE IF NOT EXISTS staff_availability (
  user_id       TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','busy','on_leave','off_shift')),
  work_start    TIME NOT NULL DEFAULT '09:30',
  work_end      TIME NOT NULL DEFAULT '18:30',
  work_days     INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  mute_until    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.7 — message templates (versioned, approved, restricted)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS message_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID NOT NULL,
  code              TEXT NOT NULL,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'general',
  channel           TEXT NOT NULL DEFAULT 'whatsapp'
                      CHECK (channel IN ('whatsapp','sms','email','portal','chat','internal')),
  language          TEXT NOT NULL DEFAULT 'en',
  subject           TEXT NOT NULL DEFAULT '',
  body              TEXT NOT NULL DEFAULT '',
  media_url         TEXT NOT NULL DEFAULT '',
  media_kind        TEXT NOT NULL DEFAULT '',
  -- WhatsApp Business templates are approved by Meta, separately from us.
  -- Storing the Meta name keeps the CRM honest about what it can actually send.
  meta_template_name TEXT NOT NULL DEFAULT '',
  meta_approved     BOOLEAN NOT NULL DEFAULT false,
  version           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','pending','active','inactive','retired')),
  change_note       TEXT NOT NULL DEFAULT '',
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  superseded_by     UUID REFERENCES message_templates(id),
  allowed_roles     TEXT[] NOT NULL DEFAULT ARRAY['counselor','telecaller','admin','super_admin','branch_head'],
  allowed_branches  UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  countries         TEXT[] NOT NULL DEFAULT ARRAY['All'],
  intakes           TEXT[] NOT NULL DEFAULT ARRAY['All'],
  student_stages    TEXT[] NOT NULL DEFAULT ARRAY['All'],
  is_bulk_allowed   BOOLEAN NOT NULL DEFAULT false,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, version)
);
CREATE INDEX IF NOT EXISTS idx_msg_tpl_family ON message_templates(family_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_msg_tpl_live ON message_templates(status, channel, category);

-- ---------------------------------------------------------------------------
-- 2.7 — automation rules
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS communication_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  event           TEXT NOT NULL,
  template_id     UUID REFERENCES message_templates(id),
  channel         TEXT NOT NULL DEFAULT 'whatsapp',
  recipient       TEXT NOT NULL DEFAULT 'student'
                    CHECK (recipient IN ('student','counselor','telecaller','branch_head','partner','accountant','super_admin')),
  delay_minutes   INTEGER NOT NULL DEFAULT 0,
  branch_ids      UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  countries       TEXT[] NOT NULL DEFAULT ARRAY['All'],
  conditions      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- kill switch and blast radius cap: a misconfigured rule stops itself
  is_active       BOOLEAN NOT NULL DEFAULT false,
  max_per_day     INTEGER NOT NULL DEFAULT 200,
  sent_today      INTEGER NOT NULL DEFAULT 0,
  counter_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  paused_reason   TEXT NOT NULL DEFAULT '',
  quiet_start     TIME,
  quiet_end       TIME,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_rules_event ON communication_rules(event, is_active);

CREATE TABLE IF NOT EXISTS communication_log (
  id             BIGSERIAL PRIMARY KEY,
  rule_id        UUID REFERENCES communication_rules(id),
  template_id    UUID REFERENCES message_templates(id),
  channel        TEXT NOT NULL,
  direction      TEXT NOT NULL DEFAULT 'outbound',
  recipient_type TEXT NOT NULL DEFAULT 'student',
  recipient_id   TEXT NOT NULL DEFAULT '',
  recipient_addr TEXT NOT NULL DEFAULT '',
  student_id     TEXT,
  branch_id      UUID,
  sent_by        TEXT,
  body_preview   TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','sent','delivered','read','failed','skipped')),
  skip_reason    TEXT NOT NULL DEFAULT '',
  error          TEXT NOT NULL DEFAULT '',
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for  TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_log_time ON communication_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_log_status ON communication_log(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_comm_log_student ON communication_log(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS communication_consent (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL DEFAULT 'student',
  subject_id   TEXT NOT NULL,
  channel      TEXT NOT NULL,
  opted_out    BOOLEAN NOT NULL DEFAULT false,
  consent_at   TIMESTAMPTZ,
  reason       TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, channel)
);

-- Out-of-office / auto-response rules (2.7 bullet 5)
CREATE TABLE IF NOT EXISTS auto_response_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type    TEXT NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global','branch','user')),
  scope_id      TEXT NOT NULL DEFAULT '*',
  template_id   UUID REFERENCES message_templates(id),
  message       TEXT NOT NULL DEFAULT '',
  work_start    TIME NOT NULL DEFAULT '09:30',
  work_end      TIME NOT NULL DEFAULT '18:30',
  work_days     INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  response_time_wording TEXT NOT NULL DEFAULT 'We usually reply within one working day.',
  summary_recipients TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active     BOOLEAN NOT NULL DEFAULT true,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id)
);

-- ---------------------------------------------------------------------------
-- 2.7 — chat supervision and student escalation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_supervision_events (
  id                BIGSERIAL PRIMARY KEY,
  conversation_type TEXT NOT NULL,
  conversation_id   TEXT NOT NULL,
  actor_id          TEXT NOT NULL,
  actor_name        TEXT NOT NULL DEFAULT '',
  actor_role        TEXT NOT NULL DEFAULT '',
  action            TEXT NOT NULL CHECK (action IN ('view','join','leave','message','export')),
  note              TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supervision_conv ON chat_supervision_events(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_escalations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type TEXT NOT NULL DEFAULT 'student',
  conversation_id   TEXT NOT NULL DEFAULT '',
  message_id        TEXT NOT NULL DEFAULT '',
  reported_message  TEXT NOT NULL DEFAULT '',
  student_id        TEXT NOT NULL,
  counselor_id      TEXT,
  branch_id         UUID,
  reason            TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'other',
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','reviewing','resolved','dismissed')),
  handled_by        TEXT,
  resolution_note   TEXT NOT NULL DEFAULT '',
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON chat_escalations(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Per-agent status visibility (2.6.2, "configurable separately by Super Admin
-- for each Agent or Freelancer account"). Defaults preserve today's behaviour.
-- ---------------------------------------------------------------------------

ALTER TABLE partners ADD COLUMN IF NOT EXISTS show_application_status BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS show_visa_status        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS show_next_step          BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS show_document_status    BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Seed the status vocabulary so the platform is usable the moment this runs.
-- These are ON CONFLICT DO NOTHING: if the client has already defined their
-- own, nothing here overwrites it.
-- ---------------------------------------------------------------------------

INSERT INTO status_vocabulary (kind, code, label, color, stage_index, is_terminal, visible_to) VALUES
  ('document','pending','Not uploaded','slate',0,false,ARRAY['staff','student','partner']),
  ('document','uploaded','Uploaded','sky',1,false,ARRAY['staff','student','partner']),
  ('document','under_review','Under review','amber',2,false,ARRAY['staff','student','partner']),
  ('document','resubmit','Resubmission needed','rose',2,false,ARRAY['staff','student','partner']),
  ('document','accepted','Accepted','emerald',3,true,ARRAY['staff','student','partner']),
  ('document','not_required','Already available','violet',3,true,ARRAY['staff','student','partner']),

  ('application','not_started','Not started','slate',0,false,ARRAY['staff','student','partner']),
  ('application','preparing','Preparing','sky',1,false,ARRAY['staff','student','partner']),
  ('application','submitted','Submitted to university','indigo',2,false,ARRAY['staff','student','partner']),
  ('application','offer_conditional','Conditional offer','amber',3,false,ARRAY['staff','student','partner']),
  ('application','offer_unconditional','Unconditional offer','emerald',4,false,ARRAY['staff','student','partner']),
  ('application','rejected','Rejected','rose',4,true,ARRAY['staff','student','partner']),
  ('application','enrolled','Enrolled','emerald',5,true,ARRAY['staff','student','partner']),

  ('visa','not_started','Not started','slate',0,false,ARRAY['staff','student','partner']),
  ('visa','documents','Visa documents','sky',1,false,ARRAY['staff','student','partner']),
  ('visa','biometrics','Biometrics booked','indigo',2,false,ARRAY['staff','student','partner']),
  ('visa','filed','Application filed','amber',3,false,ARRAY['staff','student','partner']),
  ('visa','interview','Interview scheduled','amber',4,false,ARRAY['staff','student','partner']),
  ('visa','approved','Visa approved','emerald',5,true,ARRAY['staff','student','partner']),
  ('visa','refused','Visa refused','rose',5,true,ARRAY['staff','student','partner']),

  ('commission_visibility','hidden','Hidden from agent','slate',0,false,ARRAY['staff']),
  ('commission_visibility','pending','Pending approval','amber',1,false,ARRAY['staff','partner']),
  ('commission_visibility','approved','Approved','sky',2,false,ARRAY['staff','partner']),
  ('commission_visibility','paid','Paid','emerald',3,true,ARRAY['staff','partner']),

  ('next_step','awaiting_student','Waiting on the student','amber',0,false,ARRAY['staff','student','partner']),
  ('next_step','awaiting_counsellor','With the counsellor','sky',0,false,ARRAY['staff','student','partner']),
  ('next_step','awaiting_university','With the university','indigo',0,false,ARRAY['staff','student','partner']),
  ('next_step','awaiting_embassy','With the embassy','violet',0,false,ARRAY['staff','student','partner']),
  ('next_step','no_action','No action needed','emerald',0,true,ARRAY['staff','student','partner'])
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO document_reason_master (kind, code, label, body) VALUES
  ('rejection','unreadable','Unreadable scan','The scan is blurred or cropped. Please upload a clear full-page copy.'),
  ('rejection','expired','Document expired','This document has expired. Please upload a current one.'),
  ('rejection','wrong_document','Wrong document','This is not the document requested. Please check the description and re-upload.'),
  ('rejection','incomplete','Incomplete','Some pages are missing. Please upload the complete document.'),
  ('rejection','name_mismatch','Name mismatch','The name does not match your passport. Please share a supporting document.'),
  ('request','additional','Additional document needed','We need one more document to move your application forward.')
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO alert_settings (scope_type, scope_id, alert_type, priority, color, channels) VALUES
  ('global','*','lead_assigned','high','sky',ARRAY['bell','toast','sound']),
  ('global','*','lead_transferred','high','indigo',ARRAY['bell','toast','sound']),
  ('global','*','branch_lead_arrived','normal','sky',ARRAY['bell','toast']),
  ('global','*','followup_due','normal','amber',ARRAY['bell','toast','sound']),
  ('global','*','followup_overdue','urgent','rose',ARRAY['bell','toast','sound','banner']),
  ('global','*','hot_lead_update','urgent','rose',ARRAY['bell','toast','sound','banner']),
  ('global','*','missed_response','high','amber',ARRAY['bell','toast','sound']),
  ('global','*','document_rejected','normal','rose',ARRAY['bell','toast']),
  ('global','*','application_status_changed','normal','indigo',ARRAY['bell','toast']),
  ('global','*','escalation_raised','urgent','rose',ARRAY['bell','toast','banner'])
ON CONFLICT (scope_type, scope_id, alert_type) DO NOTHING;
