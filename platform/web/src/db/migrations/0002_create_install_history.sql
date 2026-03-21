CREATE TABLE IF NOT EXISTS install_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  app_id UUID NOT NULL REFERENCES apps(id),
  action TEXT NOT NULL CHECK (action IN ('install', 'uninstall')),
  instance_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_install_history_user ON install_history(user_id);
CREATE INDEX IF NOT EXISTS idx_install_history_app ON install_history(app_id);
CREATE INDEX IF NOT EXISTS idx_install_history_instance ON install_history(user_id, instance_name);
