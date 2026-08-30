const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = 'https://ztplxqlthuqkuktbznbo.supabase.co';
// Using the service role key would be better for server-side scripts, but I'll use the anon key if it has permission or just get the service role if I can.
// Actually, I don't have the service role key. I have the anon key. 
// I'll check if I can find the service role key in secrets.
const key = 'sb_publishable_pZn78D3GktxXNZeFZOWynA_nYgD0TvK';

const supabase = createClient(url, key);

async function uploadFile(bucket, filePath, fileName) {
    const fileContent = fs.readFileSync(filePath);
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, fileContent, {
        contentType: 'image/jpeg',
        upsert: true
    });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
}

async function run() {
    try {
        console.log('Starting product addition...');

        // 1. Ensure category exists
        let categoryId;
        const { data: existingCat, error: catFetchError } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', 'home-tools')
            .single();

        if (catFetchError || !existingCat) {
            console.log('Creating category...');
            const { data: newCat, error: catCreateError } = await supabase
                .from('categories')
                .insert({ name: 'أدوات منزلية', slug: 'home-tools', sort_order: 1 })
                .select()
                .single();
            if (catCreateError) throw catCreateError;
            categoryId = newCat.id;
        } else {
            categoryId = existingCat.id;
        }
        console.log('Category ID:', categoryId);

        // 2. Upload images
        const imgDir = 'f:/Cuctomer-Projects/Stores/DilMart-store/product-photo/1';
        const files = fs.readdirSync(imgDir);
        const imageUrls = [];

        for (const file of files) {
            if (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg')) {
                console.log(`Uploading ${file}...`);
                const fullPath = path.join(imgDir, file);
                const fileName = `products/hyderon-${Date.now()}-${file.replace(/\s+/g, '_')}`;
                const url = await uploadFile('products', fullPath, fileName);
                imageUrls.push(url);
            }
        }
        console.log('Uploaded images:', imageUrls);

        // 3. Insert product
        const product = {
            category_id: categoryId,
            name: 'شريط عزل الأبواب والنوافذ HYDERON – بطول 5 متر',
            slug: 'hyderon-sealing-strip-5m',
            description: `ودّع دخول الغبار، الهواء البارد، والحشرات نهائيًا
مع شريط العزل HYDERON الحل العملي والاقتصادي لكل بيت
✅ المميزات:
🔹 عزل ممتاز للهواء والضوضاء
🔹 يقلل اصطدام الأبواب ويخفف الصوت
🔹 يمنع دخول الغبار والحشرات
🔹 سهل التركيب بدون أدوات (DIY)
🔹 مناسب للأبواب والنوافذ
🔹 خامة مرنة وعمر استخدام طويل
🔹 طول 5 متر يكفي أكثر من باب
مثالي للبيوت، المكاتب، والمحلات
راحة أكثر هدوء أكثر توفير بالطاقة`,
            price: 15000, // Example price, will need adjustment if user provides one
            stock: 50,
            is_active: true,
            is_featured: true,
            images: imageUrls
        };

        const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert(product)
            .select()
            .single();

        if (productError) throw productError;
        console.log('Product added successfully:', newProduct.id);

    } catch (err) {
        console.error('Operation failed:', err);
    }
}

run();
