CREATE TABLE tournaments (room_id TEXT NOT NULL, uid TEXT NOT NULL, capacity INTEGER NOT NULL, placement INTEGER NOT NULL, points INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(room_id,uid));
--> statement-breakpoint
CREATE INDEX tournament_profile ON tournaments(uid,created_at);
