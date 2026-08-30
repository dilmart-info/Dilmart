const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = 'https://ztplxqlthuqkuktbznbo.supabase.co';
const key = 'sb_publishable_pZn78D3GktxXNZeFZOWynA_nYgD0TvK';

const supabase = createClient(url, key);

async function uploadFile(bucket, filePath, fileName) {
    const fileContent = fs.readFileSync(filePath);
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, fileContent, {
        contentType: 'image/jpeg',
        upsert: true
    });
    if (error) {
        if (error.message.includes('The resource already exists')) {
            const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
            return publicUrl;
        }
        throw error;
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
}

async function run() {
    try {
        console.log('Uploading images...');
        const imgDir = 'f:/Cuctomer-Projects/Stores/DilMart-store/product-photo/1';
        const files = fs.readdirSync(imgDir);
        const imageUrls = [];

        for (const file of files) {
            if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png') || file.toLowerCase().endsWith('.jpeg')) {
                console.log(`Uploading ${file}...`);
                const fullPath = path.join(imgDir, file);
                const fileName = `products/hyderon/${file.trim().replace(/\s+/g, '_')}`;
                try {
                    const url = await uploadFile('products', fullPath, fileName);
                    imageUrls.push(url);
                } catch (e) {
                    console.error(`Failed to upload ${file}:`, e.message);
                }
            }
        }
        console.log('Uploaded images:', imageUrls);

        if (imageUrls.length > 0) {
            console.log('Updating product with image URLs...');
            const { error } = await supabase
                .from('products')
                .update({ images: imageUrls })
                .eq('slug', 'hyderon-sealing-strip-5m');

            if (error) throw error;
            console.log('Product updated successfully!');
        }

    } catch (err) {
        console.error('Operation failed:', err);
    }
}

run();
