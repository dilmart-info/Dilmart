const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = 'https://ztplxqlthuqkuktbznbo.supabase.co';
const key = 'sb_publishable_pZn78D3GktxXNZeFZOWynA_nYgD0TvK';

const supabase = createClient(url, key);

async function run() {
    const { data: categories, error } = await supabase.from('categories').select('*');
    if (error) {
        console.error('Error fetching categories:', error);
        return;
    }
    console.log('Categories:', JSON.stringify(categories, null, 2));
}

run();
