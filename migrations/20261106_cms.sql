-- EngiAdda CMS schema. Apply to the production branch only after reviewing this migration.
CREATE TABLE IF NOT EXISTS public.content_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 content_type text NOT NULL CHECK (content_type IN ('article','resource')),
 title varchar(240) NOT NULL,
 slug varchar(260) NOT NULL UNIQUE,
 excerpt varchar(600),
 body_markdown text,
 category varchar(100) NOT NULL,
 subject varchar(120),
 exam varchar(120),
 tags text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 file_key varchar(1024),
 file_name varchar(255),
 file_mime varchar(120),
 file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 1 AND 52428800),
 seo_title varchar(70),
 seo_description varchar(180),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 CHECK ((content_type = 'article' AND body_markdown IS NOT NULL) OR content_type = 'resource')
);
CREATE INDEX IF NOT EXISTS content_items_public_idx ON public.content_items (published_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS content_items_admin_idx ON public.content_items (updated_at DESC);
CREATE TABLE IF NOT EXISTS public.cms_audit_log (
 id bigserial PRIMARY KEY,
 action varchar(40) NOT NULL,
 content_id uuid,
 actor varchar(120) NOT NULL DEFAULT 'admin',
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cms_login_attempts (
 username varchar(80) PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 0,
 window_started timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz
);
