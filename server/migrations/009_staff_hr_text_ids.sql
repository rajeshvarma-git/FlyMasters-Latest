-- 009: let attendance / leave / salary hold ANY staff id.
-- Telecaller ids are "user-<uuid>" text, the tables were created with UUID counselor_id,
-- so telecaller clock-in failed with 22P02. Widening to TEXT is lossless (uuid::text).
-- No FKs or joins on these columns exist in the application code.
ALTER TABLE counselor_attendance     ALTER COLUMN counselor_id TYPE TEXT USING counselor_id::text;
ALTER TABLE counselor_leave_requests ALTER COLUMN counselor_id TYPE TEXT USING counselor_id::text;
ALTER TABLE counselor_salary_records ALTER COLUMN counselor_id TYPE TEXT USING counselor_id::text;
