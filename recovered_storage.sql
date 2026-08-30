-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public to view images
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'products');

-- Allow admins to upload/manage images
DROP POLICY IF EXISTS "Admin Manage Images" ON storage.objects;
CREATE POLICY "Admin Manage Images" ON storage.objects 
  FOR ALL USING (
    bucket_id = 'products' AND (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  );
