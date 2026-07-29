CREATE TABLE rooms (
    id UUID PRIMARY KEY,
    title VARCHAR(80) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE room_members (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    member_id UUID PRIMARY KEY,
    display_name VARCHAR(40) NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
    role VARCHAR(16) NOT NULL CHECK (role IN ('host', 'participant')),
    joined_at TIMESTAMPTZ NOT NULL,
    UNIQUE (room_id, member_id)
);

CREATE INDEX room_members_by_room_id ON room_members(room_id, joined_at);
