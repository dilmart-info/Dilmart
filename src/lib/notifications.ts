/**
 * Play a notification sound
 * Note: Browsers usually block audio unless there has been user interaction first.
 */

let merchantAlertAudio: HTMLAudioElement | null = null;
let merchantAlertInterval: number | null = null;
let merchantAlertStopAt = 0;

export const playNotificationSound = (type: "default" | "merchant_new_order" = "default") => {
    try {
        if (type === "merchant_new_order") {
            const isEnabled = localStorage.getItem("DilMart_merchant_order_sound_enabled") === "true";
            if (!isEnabled) {
                return;
            }
            if (!merchantAlertAudio) {
                merchantAlertAudio = new Audio("/sounds/merchant-new-order.wav");
                merchantAlertAudio.volume = 0.8;
            } else {
                merchantAlertAudio.pause();
                merchantAlertAudio.currentTime = 0;
            }
            void merchantAlertAudio.play().catch((err) => {
                console.warn("Sound playback prevented by browser policy. Interaction needed first.", err);
            });
        } else {
            const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
            audio.volume = 0.5;
            audio.play().catch((err) => {
                console.warn("Sound playback prevented by browser policy. Interaction needed first.", err);
            });
        }
    } catch (error) {
        console.error("Error playing notification sound:", error);
    }
};

/** Repeat merchant new-order sound every `intervalMs` until stopped or max duration. */
export function startMerchantOrderAlertLoop(options?: {
    intervalMs?: number;
    maxDurationMs?: number;
}) {
    const isEnabled = localStorage.getItem("DilMart_merchant_order_sound_enabled") === "true";
    if (!isEnabled) return;

    const intervalMs = options?.intervalMs ?? 15_000;
    const maxDurationMs = options?.maxDurationMs ?? 5 * 60_000;

    stopMerchantOrderAlertLoop();
    merchantAlertStopAt = Date.now() + maxDurationMs;
    playNotificationSound("merchant_new_order");

    merchantAlertInterval = window.setInterval(() => {
        if (Date.now() >= merchantAlertStopAt) {
            stopMerchantOrderAlertLoop();
            return;
        }
        playNotificationSound("merchant_new_order");
    }, intervalMs);
}

export function stopMerchantOrderAlertLoop() {
    if (merchantAlertInterval != null) {
        window.clearInterval(merchantAlertInterval);
        merchantAlertInterval = null;
    }
    if (merchantAlertAudio) {
        try {
            merchantAlertAudio.pause();
            merchantAlertAudio.currentTime = 0;
        } catch {
            // ignore
        }
    }
    merchantAlertStopAt = 0;
}
