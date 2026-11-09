CREATE TABLE active_rooms (uid TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL, expires_at INTEGER NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX active_room_lookup ON active_rooms(room_id);
