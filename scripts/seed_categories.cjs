const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * يعتمد على env الموجود في المشروع:
 * VITE_SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY (يجب استخدامه للعمليات الإدارية لتجاوز RLS)
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const categories = [
    { name: 'الأجهزة الكهربائية الكبيرة', slug: 'large-home-appliances', sort_order: 1 },
    { name: 'أجهزة المطبخ', slug: 'kitchen-appliances', sort_order: 2 },
    { name: 'أدوات المطبخ والأواني', slug: 'kitchen-tools-cookware', sort_order: 3 },
    { name: 'الطباخات والأفران', slug: 'cookers-ovens', sort_order: 4 },
    { name: 'أجهزة التنظيف الكهربائية', slug: 'electric-cleaning-tools', sort_order: 5 },
    { name: 'أدوات الحدائق', slug: 'garden-tools', sort_order: 6 },
    { name: 'أجهزة التدفئة', slug: 'heaters', sort_order: 7 },
    { name: 'الأجهزة الرياضية', slug: 'sports-fitness', sort_order: 8 },
    { name: 'الملابس', slug: 'clothing', sort_order: 9 },
    { name: 'الحقائب', slug: 'bags', sort_order: 10 },
    { name: 'الهدايا', slug: 'gifts', sort_order: 11 },
    { name: 'الألعاب', slug: 'toys', sort_order: 12 },
    { name: 'الدراجات الكهربائية الصغيرة', slug: 'small-electric-bikes-scooters', sort_order: 13 },
    { name: 'الشبكات والإنترنت', slug: 'networking-internet', sort_order: 14 },
];

async function run() {
    console.log('Seeding categories...');

    const payload = categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        sort_order: c.sort_order,
        image_url: null,
    }));

    const { data, error } = await supabase
        .from('categories')
        .upsert(payload, { onConflict: 'slug' })
        .select('id, name, slug, sort_order')
        .order('sort_order', { ascending: true });

    if (error) {
        console.error('Failed to seed categories:', error);
        process.exit(1);
    }

    console.log('Done. Categories:');
    data.forEach((row) => console.log(`- ${row.sort_order}. ${row.name} (${row.slug})`));
}

run();
