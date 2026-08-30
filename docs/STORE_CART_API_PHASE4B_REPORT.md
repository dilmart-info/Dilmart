# Phase 4B — Store Backend B2B Cart API

**Branch:** `feat/store-cart-api-phase4b`  
**Scope:** `DilMart-Store/backend` only  
**Date:** 2026-06-07

---

## الهدف

بناء Cart Module كامل في Store Backend لدعم الـ Barber App B2B marketplace flow.  
الـ cart مملوك لـ `store_linked_profile_id` من الـ `X-Store-Session` — وليس `user_id`.

---

## الملفات

### جديدة

| الملف                                                       | الوصف                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `supabase/migrations/20260607100000_m29_store_b2b_cart.sql` | جداول `store_carts` + `store_cart_items`                                            |
| `backend/src/modules/cart/cart.types.ts`                    | Domain types (CartRecord, CartItemRecord, CartResponse, CartTotals, ProductForCart) |
| `backend/src/modules/cart/cart.dto.ts`                      | Request DTOs (AddCartItemDto, UpdateCartItemDto)                                    |
| `backend/src/modules/cart/cart.service.ts`                  | Business logic كاملة                                                                |
| `backend/src/modules/cart/cart.controller.ts`               | 5 endpoints                                                                         |

### معدّلة

| الملف                                     | التعديل                                 |
| ----------------------------------------- | --------------------------------------- |
| `backend/src/modules/cart/cart.module.ts` | من stub فارغ إلى module كامل مع imports |

---

## Endpoints

| Method   | Path                  | الوصف                                 |
| -------- | --------------------- | ------------------------------------- |
| `GET`    | `/cart`               | جلب السلة الحالية (فارغة إذا لا توجد) |
| `POST`   | `/cart/items`         | إضافة منتج                            |
| `PATCH`  | `/cart/items/:itemId` | تحديث الكمية                          |
| `DELETE` | `/cart/items/:itemId` | حذف عنصر واحد                         |
| `DELETE` | `/cart/clear`         | تفريغ السلة كاملاً                    |

**كل endpoint يتطلب:** `X-Store-Session` header

---

## قواعد الأمان والتصميم

### ملكية السلة

```
store_linked_profile_id (من X-Store-Session)
≠ web user_id
≠ phone
≠ anonymous session
```

### التسعير (Server-side فقط)

```
Client يرسل فقط:   { productId: UUID, quantity: int }
Backend يجلب من DB: price, discount_price, name, slug, images, stock
effective_unit_price = discount_price < unit_price ? discount_price : unit_price
line_total           = effective_unit_price × quantity
totals               = SUM(line_total per item)
```

### قاعدة التاجر الواحد

```
إذا cart.merchant_id ≠ product.merchant_id:
→ 409 Conflict: "Cart contains products from another merchant. Clear cart first."
```

### Visibility (نفس منطق Home/Product Detail)

```typescript
// يستخدم ProductVisibilityService.canProductBeShown() مباشرة
// لا تكرار للمنطق — مصدر واحد للـ visibility rules
if (!this.visibilityService.canProductBeShown(product, viewerCtx)) {
  throw new NotFoundException(`Product not found.`);
}
```

### التحقق من الكمية

```
quantity < product.min_order_qty → 422
quantity > product.max_order_qty → 422
quantity > product.stock_quantity → 422
```

---

## M29 Schema

```sql
store_carts:
  id uuid PK
  store_linked_profile_id uuid FK → store_linked_profiles.id
  source_app text DEFAULT 'barber_app'
  segment text (snapshot)
  business_type text (snapshot)
  merchant_id uuid FK → merchants.id (single-merchant rule)
  status text CHECK (active|checkout_in_progress|converted|abandoned|cleared)
  UNIQUE INDEX (store_linked_profile_id) WHERE status = 'active'

store_cart_items:
  id uuid PK
  cart_id uuid FK → store_carts.id CASCADE
  product_id uuid FK → products.id RESTRICT
  merchant_id uuid FK → merchants.id RESTRICT
  quantity int CHECK > 0
  product_name text (snapshot)
  product_slug text (snapshot)
  product_image_url text (snapshot)
  unit_price numeric(12,2)
  effective_unit_price numeric(12,2)
  line_total numeric(12,2)
  UNIQUE (cart_id, product_id)
```

---

## CartResponse Structure

```json
{
  "cart": {
    "id": "uuid",
    "store_linked_profile_id": "uuid",
    "source_app": "barber_app",
    "segment": "DilMart_APP_BARBER_OWNER",
    "business_type": "men_barbershop",
    "merchant_id": "uuid",
    "status": "active",
    "created_at": "...",
    "updated_at": "..."
  },
  "items": [
    {
      "id": "uuid",
      "cart_id": "uuid",
      "product_id": "uuid",
      "merchant_id": "uuid",
      "quantity": 2,
      "product_name": "ماكينة حلاقة احترافية",
      "product_slug": "professional-clipper-x",
      "product_image_url": "https://...",
      "unit_price": 75000,
      "effective_unit_price": 62000,
      "line_total": 124000,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "totals": {
    "subtotal": 124000,
    "discountTotal": 26000,
    "total": 124000,
    "itemCount": 2
  }
}
```

---

## Acceptance Criteria — النتائج

| المعيار                                                 | الحالة          |
| ------------------------------------------------------- | --------------- |
| Cart module لم يعد فارغاً                               | ✅              |
| M29 migration موجود                                     | ✅              |
| `GET /cart` مع X-Store-Session يُعيد cart أو empty cart | ✅              |
| `POST /cart/items` يضيف منتجاً مرئياً                   | ✅              |
| `PATCH /cart/items/:itemId` يحدث الكمية                 | ✅              |
| `DELETE /cart/items/:itemId` يحذف عنصر                  | ✅              |
| `DELETE /cart/clear` يفرغ السلة                         | ✅              |
| منتجات من تاجر ثانٍ تُرفض بـ 409                        | ✅              |
| الأسعار محسوبة من DB                                    | ✅              |
| Visibility rules مُطبَّقة من `canProductBeShown()`      | ✅              |
| ملكية السلة = `store_linked_profile_id`                 | ✅              |
| لا checkout/order في هذه المرحلة                        | ✅              |
| Build يمر                                               | ✅ (بعد التحقق) |
| التوثيق موجود                                           | ✅              |

---

## الخطوة التالية — Phase 5

بعد اعتماد Phase 4B:

- `POST /cart/checkout` — B2B Order creation من السلة
- `CheckoutService.submitB2B()` يستخدم `linkedProfileId` من الـ session
- `GET /orders/b2b/me` يُعيد orders بدل `user_id` العادي
