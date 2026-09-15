-- A lesson could hold exactly one video link. Authors wanted to add further videos and
-- reference links to the same lesson, so each topic now carries an ordered list of them.
-- Existing topics start with an empty list; their main video is untouched.
ALTER TABLE "Topic" ADD COLUMN "resources" JSONB NOT NULL DEFAULT '[]';
