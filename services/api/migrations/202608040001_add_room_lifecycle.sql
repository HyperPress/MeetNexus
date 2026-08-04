ALTER TABLE rooms
ADD COLUMN closed_at TIMESTAMPTZ NULL;

ALTER TABLE room_members
ADD COLUMN left_at TIMESTAMPTZ NULL;

CREATE INDEX room_members_active_by_room_id
ON room_members(room_id, joined_at)
WHERE left_at IS NULL;
