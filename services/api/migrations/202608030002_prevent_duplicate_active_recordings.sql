CREATE UNIQUE INDEX recordings_one_active_per_member
    ON recordings(room_id, member_id)
    WHERE state = 'recording';
