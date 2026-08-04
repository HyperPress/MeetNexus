ALTER TABLE rooms ADD COLUMN meeting_code VARCHAR(11);

WITH numbered_rooms AS (
    SELECT
        id,
        to_char(100000000 + row_number() OVER (ORDER BY created_at, id)::BIGINT - 1, 'FM000000000') AS digits
    FROM rooms
)
UPDATE rooms
SET meeting_code = substring(numbered_rooms.digits FROM 1 FOR 3)
    || '-' || substring(numbered_rooms.digits FROM 4 FOR 3)
    || '-' || substring(numbered_rooms.digits FROM 7 FOR 3)
FROM numbered_rooms
WHERE rooms.id = numbered_rooms.id;

ALTER TABLE rooms ALTER COLUMN meeting_code SET NOT NULL;
ALTER TABLE rooms ADD CONSTRAINT rooms_meeting_code_key UNIQUE (meeting_code);
ALTER TABLE rooms ADD CONSTRAINT rooms_meeting_code_format CHECK (meeting_code ~ '^[0-9]{3}-[0-9]{3}-[0-9]{3}$');
