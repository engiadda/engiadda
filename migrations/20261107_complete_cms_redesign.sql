-- EngiAdda CMS redesign: additive, backward-compatible publishing metadata.
ALTER TABLE cms.content_items
  DROP CONSTRAINT IF EXISTS content_items_content_type_check;
ALTER TABLE cms.content_items
  ADD CONSTRAINT content_items_content_type_check
  CHECK (content_type IN (
    'article','resource','recruitment','exam_update','result',
    'syllabus','tutorial','career_guidance'
  ));

-- The original bootstrap CHECK only allowed article/resource rows; widen it too.
ALTER TABLE cms.content_items
  DROP CONSTRAINT IF EXISTS content_items_check,
  ADD CONSTRAINT content_items_body_requirement_check
    CHECK (content_type = 'resource' OR (body_markdown IS NOT NULL AND length(btrim(body_markdown)) > 0));

ALTER TABLE cms.content_items
  ADD COLUMN IF NOT EXISTS disciplines text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS author varchar(120),
  ADD COLUMN IF NOT EXISTS featured_image_url varchar(2048),
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cms.content_items
  DROP CONSTRAINT IF EXISTS content_items_metadata_object_check,
  ADD CONSTRAINT content_items_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  DROP CONSTRAINT IF EXISTS content_items_attachments_array_check,
  ADD CONSTRAINT content_items_attachments_array_check
    CHECK (jsonb_typeof(attachments) = 'array');

CREATE INDEX IF NOT EXISTS content_items_schedule_idx
  ON cms.content_items (scheduled_at)
  WHERE status = 'published' AND scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_items_type_public_idx
  ON cms.content_items (content_type, published_at DESC)
  WHERE status = 'published';
