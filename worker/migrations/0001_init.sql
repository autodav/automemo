-- Schema del backend push di AutoMemo. Contiene SOLO i dati minimi per inviare i promemoria.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,            -- id anonimo casuale generato dal dispositivo
  endpoint TEXT NOT NULL UNIQUE,  -- URL del push service (FCM, Mozilla, Apple, Microsoft)
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_test_at TEXT
);

CREATE TABLE IF NOT EXISTS deadlines (
  device_id TEXT NOT NULL,
  deadline_id TEXT NOT NULL,      -- id casuale della scadenza nell'app (serve per aprire la scadenza giusta)
  vehicle_id TEXT NOT NULL,       -- id casuale del veicolo nell'app (nessun nome, nessuna targa)
  label TEXT NOT NULL,            -- tipo di scadenza, es. "Revisione"
  due_date TEXT NOT NULL,         -- YYYY-MM-DD
  thresholds INTEGER NOT NULL,    -- bitmask: 30gg=8, 15gg=4, 7gg=2, 1gg=1
  sent INTEGER NOT NULL DEFAULT 0,-- bitmask delle soglie già inviate (o saltate)
  next_send_date TEXT,            -- giorno del prossimo invio (NULL = nessuno)
  PRIMARY KEY (device_id, deadline_id)
);

CREATE INDEX IF NOT EXISTS idx_deadlines_next ON deadlines(next_send_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(due_date);
