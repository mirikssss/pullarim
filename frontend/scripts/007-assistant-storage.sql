-- Pullarim: Assistant uploads storage bucket
-- Run in Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assistant_uploads',
  'assistant_uploads',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: users can only access their own folder (user_id/...)
CREATE POLICY "assistant_uploads_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assistant_uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "assistant_uploads_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assistant_uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
