-- Add a dedicated recruitment content type and official action links without changing existing articles/resources.
ALTER TABLE cms.content_items
  DROP CONSTRAINT IF EXISTS content_items_content_type_check;
ALTER TABLE cms.content_items
  ADD CONSTRAINT content_items_content_type_check
  CHECK (content_type IN ('article', 'resource', 'recruitment'));
ALTER TABLE cms.content_items
  ADD COLUMN IF NOT EXISTS recruitment_links jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cms.content_items
  ADD CONSTRAINT content_items_recruitment_links_object_check
  CHECK (jsonb_typeof(recruitment_links) = 'object');
