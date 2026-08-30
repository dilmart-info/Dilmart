import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')

serve(async (req) => {
    try {
        const { record } = await req.json()

        const message = `
🔔 *طلب جديد برقم:* ${record.order_number}
👤 *العميل:* ${record.customer_name}
📞 *الهاتف:* ${record.customer_phone}
📍 *المحافظة:* ${record.governorate_id}
💰 *الإجمالي:* ${record.total} د.ع
    `.trim()

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown',
                }),
            })
        }

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
