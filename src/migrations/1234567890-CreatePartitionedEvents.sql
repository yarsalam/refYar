CREATE TABLE user_events (
    id BIGSERIAL,
    user_id INTEGER NOT NULL,
    target_user_id INTEGER,
    type VARCHAR(50) NOT NULL,
    session_id VARCHAR(50),
    metadata JSONB,
    value FLOAT,
    currency VARCHAR(10),
    duration INTEGER,
    platform VARCHAR(20),
    country VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- ایجاد پارتیشن‌های ماهانه
CREATE TABLE user_events_2026_01 PARTITION OF user_events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE user_events_2026_02 PARTITION OF user_events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE user_events_2026_03 PARTITION OF user_events
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- ایندکس‌ها روی هر پارتیشن
CREATE INDEX idx_user_events_2026_01_user_id ON user_events_2026_01(user_id, created_at);
CREATE INDEX idx_user_events_2026_01_type ON user_events_2026_01(type, created_at);

CREATE INDEX idx_user_events_2026_02_user_id ON user_events_2026_02(user_id, created_at);
CREATE INDEX idx_user_events_2026_02_type ON user_events_2026_02(type, created_at);