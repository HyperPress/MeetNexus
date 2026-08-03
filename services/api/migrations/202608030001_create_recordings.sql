CREATE TABLE recordings (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES room_members(member_id) ON DELETE RESTRICT,
    started_by UUID NOT NULL REFERENCES room_members(member_id) ON DELETE RESTRICT,
    live777_record_id TEXT NULL,
    mpd_path TEXT NULL,
    state VARCHAR(16) NOT NULL CHECK (state IN ('recording', 'stopped')),
    started_at TIMESTAMPTZ NOT NULL,
    stopped_at TIMESTAMPTZ NULL
);

CREATE INDEX recordings_by_room_id ON recordings(room_id, started_at DESC);
