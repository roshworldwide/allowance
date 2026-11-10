-- ALLOWANCE store (SQLite, WAL). Money is INTEGER cents everywhere. Timestamps are ISO-8601 UTC.

CREATE TABLE IF NOT EXISTS mandates (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('PENDING_LINK','ACTIVE','PAUSED','REVOKED','EXPIRED')),
  currency                 TEXT NOT NULL DEFAULT 'USD',
  budget_cents             INTEGER NOT NULL CHECK (budget_cents >= 0),
  period_start             TEXT NOT NULL,
  period_end               TEXT NOT NULL,
  per_purchase_cap_cents   INTEGER NOT NULL CHECK (per_purchase_cap_cents >= 0),
  step_up_above_cents      INTEGER NOT NULL CHECK (step_up_above_cents >= 0),
  step_up_on_new_merchant  INTEGER NOT NULL DEFAULT 0,
  allowed_categories       TEXT NOT NULL,          -- JSON string[]
  allowed_merchants        TEXT NOT NULL,          -- JSON string[] | "ANY_IN_CATEGORY"
  allow_recurring          INTEGER NOT NULL DEFAULT 0,
  velocity                 TEXT NOT NULL,          -- JSON { maxPerHour, maxPerMerchantWindowCents, windowMinutes }
  price_drift_pct          INTEGER NOT NULL DEFAULT 10,
  undo_window_sec          INTEGER NOT NULL DEFAULT 600,
  kill_switch              INTEGER NOT NULL DEFAULT 0,
  vault_token_ref          TEXT,                   -- PayPal payment token id (server-side only, never sent to the browser unmasked)
  vault_customer_ref       TEXT,
  session_id               TEXT,                   -- live demo sessions each get their own mandate
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_contracts (
  id            TEXT PRIMARY KEY,
  mandate_id    TEXT NOT NULL REFERENCES mandates(id),
  task_text     TEXT NOT NULL,
  confirmed_at  TEXT,                              -- NULL until the human clicks Confirm
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_lines (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES task_contracts(id),
  category        TEXT NOT NULL,
  product_type    TEXT NOT NULL,
  description     TEXT NOT NULL,
  max_qty         INTEGER NOT NULL CHECK (max_qty >= 1),
  max_unit_cents  INTEGER NOT NULL CHECK (max_unit_cents >= 0)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id           TEXT PRIMARY KEY,
  mandate_id   TEXT REFERENCES mandates(id),
  contract_id  TEXT REFERENCES task_contracts(id),
  mode         TEXT NOT NULL CHECK (mode IN ('guarded','unguarded','replay')),
  model        TEXT,
  status       TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  steps        TEXT                                -- JSON, recorder output (redacted)
);

CREATE TABLE IF NOT EXISTS decisions (
  id               TEXT PRIMARY KEY,               -- also the PayPal-Request-Id / invoice_id
  mandate_id       TEXT NOT NULL REFERENCES mandates(id),
  contract_id      TEXT,
  run_id           TEXT,
  tool_name        TEXT NOT NULL,
  intent           TEXT NOT NULL,                  -- JSON Intent (normalized, no attacker text)
  verdict          TEXT NOT NULL CHECK (verdict IN ('ALLOW','STEP_UP','BLOCK')),
  amount_cents     INTEGER NOT NULL,
  merchant_id      TEXT,
  sku              TEXT,
  qty              INTEGER,
  first_block      TEXT,
  step_up_reasons  TEXT NOT NULL DEFAULT '[]',     -- JSON RuleId[]
  explanation      TEXT,                           -- AI-written from the rule trace; never changes the verdict
  status           TEXT NOT NULL,                  -- EVALUATED | EXECUTED | PENDING_APPROVAL | FAILED | REFUNDED | BLOCKED | DECLINED
  latency_us       INTEGER,
  source           TEXT NOT NULL DEFAULT 'live',   -- live | replay
  at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS decisions_mandate_at ON decisions(mandate_id, at);

CREATE TABLE IF NOT EXISTS rule_results (
  decision_id  TEXT NOT NULL REFERENCES decisions(id),
  rule_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('block','step_up')),
  outcome      TEXT NOT NULL CHECK (outcome IN ('PASS','FAIL','STEP_UP','SKIP')),
  detail       TEXT NOT NULL,
  PRIMARY KEY (decision_id, rule_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  decision_id       TEXT PRIMARY KEY,
  mandate_id        TEXT NOT NULL,
  contract_id       TEXT,
  contract_line_id  TEXT,
  merchant_id       TEXT,
  sku               TEXT,
  qty               INTEGER NOT NULL DEFAULT 0,
  amount_cents      INTEGER NOT NULL CHECK (amount_cents >= 0),
  status            TEXT NOT NULL CHECK (status IN ('RESERVED','COMMITTED','RELEASED','REFUNDED')),
  created_at        TEXT NOT NULL,
  created_ms        INTEGER NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_mandate_status ON ledger_entries(mandate_id, status);

CREATE TABLE IF NOT EXISTS purchases (
  decision_id       TEXT PRIMARY KEY REFERENCES decisions(id),
  order_id          TEXT,
  capture_id        TEXT,
  status            TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL,
  path              TEXT NOT NULL CHECK (path IN ('VAULT','APPROVAL','FALLBACK','FAKE')),
  paypal_confirmed  INTEGER NOT NULL DEFAULT 0,    -- set by a verified webhook or a GET reconcile
  captured_at       TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id            TEXT PRIMARY KEY,                  -- undo-<decisionId>
  decision_id   TEXT NOT NULL REFERENCES decisions(id),
  capture_id    TEXT NOT NULL,
  refund_id     TEXT,
  status        TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id           TEXT PRIMARY KEY,
  decision_id  TEXT NOT NULL REFERENCES decisions(id),
  order_id     TEXT,
  approve_url  TEXT,
  status       TEXT NOT NULL,                      -- PENDING | APPROVED | CAPTURED | DECLINED | EXPIRED
  mode         TEXT NOT NULL CHECK (mode IN ('PAYPAL','FALLBACK')),
  created_at   TEXT NOT NULL,
  approved_at  TEXT
);

CREATE TABLE IF NOT EXISTS chain_events (
  seq        INTEGER PRIMARY KEY,
  at         TEXT NOT NULL,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,                        -- canonical JSON
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  resource_id  TEXT,
  verified     INTEGER NOT NULL,
  received_at  TEXT NOT NULL,
  summary      TEXT
);

CREATE TABLE IF NOT EXISTS kv (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
