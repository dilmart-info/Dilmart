import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { merchantApi } from "@/lib/api/merchant";
import {
  getOrCreateMerchantDeviceId,
  isMerchantSoundEnabledLocally,
  setMerchantSoundEnabledLocally,
} from "@/lib/merchant-push";
import {
  playNotificationSound,
  startMerchantOrderAlertLoop,
  stopMerchantOrderAlertLoop,
} from "@/lib/notifications";
import { toast } from "sonner";

type AlertNotification = {
  id: string;
  order_id: string | null;
  title: string;
  message: string;
  link: string | null;
  type: string;
  acknowledged_at?: string | null;
  created_at: string;
};

interface MerchantNewOrderAlertBannerProps {
  merchantId: string;
}

/**
 * Prominent audible/visual alert for unacknowledged new orders while dashboard is open.
 */
export function MerchantNewOrderAlertBanner({ merchantId }: MerchantNewOrderAlertBannerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(() => isMerchantSoundEnabledLocally());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState(15_000);
  const [maxDurationMs, setMaxDurationMs] = useState(5 * 60_000);

  const { data: notifications = [] } = useQuery({
    queryKey: ["merchant-notifications", merchantId],
    queryFn: () => merchantApi.listMerchantNotifications(merchantId, 30),
    enabled: !!merchantId,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!merchantId) return;
    void merchantApi.getMerchantSettings(merchantId).then((res) => {
      const settings = res?.settings;
      if (!settings) return;
      const intervalSec = Number(settings.sound_repeat_interval_seconds);
      const maxSec = Number(settings.sound_max_duration_seconds);
      if (Number.isFinite(intervalSec) && intervalSec >= 5 && intervalSec <= 120) {
        setIntervalMs(Math.round(intervalSec * 1000));
      }
      if (Number.isFinite(maxSec) && maxSec >= 30 && maxSec <= 1800) {
        setMaxDurationMs(Math.round(maxSec * 1000));
      }
      if (settings.sound_enabled === false) {
        setSoundEnabled(false);
      }
    }).catch(() => undefined);
  }, [merchantId]);

  const unacked = useMemo(
    () =>
      (notifications as AlertNotification[]).filter(
        (n) => n.type === "new_order" && !n.acknowledged_at,
      ),
    [notifications],
  );

  const current = useMemo(() => {
    if (!unacked.length) return null;
    if (activeId) {
      const match = unacked.find((n) => n.id === activeId);
      if (match) return match;
    }
    return unacked[0];
  }, [unacked, activeId]);

  useEffect(() => {
    if (!current) {
      stopMerchantOrderAlertLoop();
      setActiveId(null);
      return;
    }
    setActiveId(current.id);
    if (soundEnabled) {
      startMerchantOrderAlertLoop({ intervalMs, maxDurationMs });
    }
    return () => {
      // keep loop if another unacked remains — cleaned when current becomes null
    };
  }, [current?.id, soundEnabled, intervalMs, maxDurationMs]);

  useEffect(() => {
    const onAckedElsewhere = (e: Event) => {
      const detail = (e as CustomEvent).detail as { notificationId?: string } | undefined;
      if (!detail?.notificationId || detail.notificationId === current?.id) {
        stopMerchantOrderAlertLoop();
        void queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
      }
    };
    window.addEventListener("merchant-order-acknowledged", onAckedElsewhere);
    return () => window.removeEventListener("merchant-order-acknowledged", onAckedElsewhere);
  }, [current?.id, merchantId, queryClient]);

  const acknowledge = useMutation({
    mutationFn: async (input: { id: string; opened?: boolean }) => {
      return merchantApi.acknowledgeMerchantNotification(input.id, {
        device_id: getOrCreateMerchantDeviceId(),
        opened: input.opened === true,
      });
    },
    onSuccess: () => {
      stopMerchantOrderAlertLoop();
      void queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
      void queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
    },
    onError: () => toast.error("تعذر تأكيد استلام التنبيه"),
  });

  const enableSound = () => {
    setMerchantSoundEnabledLocally(true);
    setSoundEnabled(true);
    playNotificationSound("merchant_new_order");
    toast.success("تم تفعيل صوت الطلبات");
    if (current) startMerchantOrderAlertLoop({ intervalMs, maxDurationMs });
    if (merchantId) {
      void merchantApi
        .upsertMerchantSettings({ merchant_id: merchantId, sound_enabled: true })
        .catch(() => undefined);
    }
  };

  if (!current) return null;

  const orderLabel = current.order_id
    ? current.message || current.title
    : current.title;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 lg:px-8 animate-fade-in no-print">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-amber-950">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-amber-700" />
          <div>
            <p className="font-semibold">طلب جديد بانتظارك</p>
            <p className="text-amber-900/90 mt-0.5">{orderLabel}</p>
            {!soundEnabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-8 border-amber-400 bg-white text-amber-900"
                onClick={enableSound}
              >
                <Volume2 className="me-1 h-4 w-4" />
                تفعيل صوت الطلبات
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="font-semibold"
            disabled={acknowledge.isPending}
            onClick={async () => {
              await acknowledge.mutateAsync({ id: current.id, opened: true });
              navigate(current.link || `/merchant/orders/${current.order_id}`);
            }}
          >
            فتح الطلب
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 bg-white"
            disabled={acknowledge.isPending}
            onClick={() => acknowledge.mutate({ id: current.id })}
          >
            تم استلام التنبيه
          </Button>
        </div>
      </div>
    </div>
  );
}
