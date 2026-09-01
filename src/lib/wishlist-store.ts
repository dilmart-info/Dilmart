import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { trackGrowthHookEvent } from "@/lib/growth-hooks";

interface WishlistStore {
    items: string[]; // Store product IDs
    addItem: (id: string, meta?: { sourceSurface?: string }) => void;
    removeItem: (id: string, meta?: { sourceSurface?: string }) => void;
    removeItems: (ids: string[], meta?: { sourceSurface?: string }) => void;
    hasItem: (id: string) => boolean;
}

export const useWishlistStore = create<WishlistStore>()(
    persist(
        (set, get) => ({
            items: [],
            addItem: (id, meta) => {
                if (!get().items.includes(id)) {
                    set({ items: [...get().items, id] });
                    trackGrowthHookEvent("wishlist.added", {
                        productId: id,
                        sourceSurface: meta?.sourceSurface ?? "unknown",
                    });
                    toast.success("تمت الإضافة للمفضلة");
                }
            },
            removeItem: (id, meta) => {
                set({ items: get().items.filter((i) => i !== id) });
                trackGrowthHookEvent("wishlist.removed", {
                    productId: id,
                    sourceSurface: meta?.sourceSurface ?? "unknown",
                });
                toast.success("تم الحذف من المفضلة");
            },
            removeItems: (ids, meta) => {
                if (!ids || ids.length === 0) return;
                const idSet = new Set(ids);
                set({ items: get().items.filter((i) => !idSet.has(i)) });
                trackGrowthHookEvent("wishlist.removed", {
                    productId: ids.join(","),
                    sourceSurface: meta?.sourceSurface ?? "unknown",
                });
                toast.success("تمت إزالة العناصر غير المتاحة من المفضلة");
            },
            hasItem: (id) => get().items.includes(id),
        }),
        {
            name: 'wishlist-storage',
        }
    )
);
