-- Bucket de fotos: limite de 2 MB por arquivo e só imagens.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/*']
 where id = 'fotos';
