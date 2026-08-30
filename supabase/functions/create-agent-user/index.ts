import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Config missing");
        }

        // 1. Create a client with the user's JWT to verify they are an admin
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return json({ error: "No Authorization header" }, 401);
        }

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user: adminUser }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !adminUser) {
            return json({ error: "استخدم حساب أدمن صالح" }, 401);
        }

        // Check if user is admin
        const { data: profile } = await supabaseClient.from("profiles").select("role").eq("id", adminUser.id).single();
        if (profile?.role !== "admin") {
            return json({ error: "عذراً، يجب أن تكون مديراً للقيام بهذا الإجراء" }, 403);
        }

        // 2. Initialize Admin Client
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const { email, password, full_name, phone } = await req.json();

        if (!email || !password) {
            return json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }, 400);
        }

        let targetUserId: string;

        // Try to create the user
        const { data: { user: newUser }, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name, phone }
        });

        if (createError) {
            // Case: User exists in Auth but maybe not in Profiles
            if (createError.message.includes('already registered') || createError.status === 400) {
                // Find existing user
                const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
                const existingUser = users.find(u => u.email === email);

                if (existingUser) {
                    targetUserId = existingUser.id;
                    // Update metadata if needed
                    await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
                        user_metadata: { full_name, phone }
                    });
                } else {
                    return json({ error: "المستخدم موجود مسبقاً في النظام ولكن تعذر الوصول لبياناته" }, 400);
                }
            } else {
                return json({ error: createError.message }, 400);
            }
        } else {
            targetUserId = newUser!.id;
        }

        // Update or Insert profile
        const profileUpdate: Record<string, unknown> = {
            id: targetUserId,
            role: "agent",
            full_name: full_name || "",
            phone: phone || "",
            email: email,
            updated_at: new Date().toISOString(),
        };

        const { error: profileError } = await supabaseAdmin.from("profiles").upsert(profileUpdate);

        if (profileError) {
            return json({
                error: "تم إنشاء الحساب، ولكن فشل تحديث الصلاحيات في قاعدة البيانات: " + profileError.message,
                details: profileError,
            }, 500);
        }

        return json({ message: "تمت العملية بنجاح", userId: targetUserId }, 200);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: "خطأ داخلي في النظام: " + message }, 500);
    }
});
