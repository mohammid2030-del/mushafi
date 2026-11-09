CREATE TABLE rooms (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, visibility TEXT NOT NULL, mode TEXT NOT NULL, capacity INTEGER NOT NULL, config_key TEXT NOT NULL, status TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX room_matching ON rooms(visibility,status,config_key,expires_at);
--> statement-breakpoint
CREATE TABLE awards (room_id TEXT NOT NULL, match_id TEXT NOT NULL, uid TEXT NOT NULL, points INTEGER NOT NULL, won INTEGER NOT NULL, champion INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY(room_id,match_id,uid));
--> statement-breakpoint
CREATE INDEX award_profile ON awards(uid);
--> statement-breakpoint
CREATE TABLE limits (id TEXT PRIMARY KEY NOT NULL, bucket INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0);
