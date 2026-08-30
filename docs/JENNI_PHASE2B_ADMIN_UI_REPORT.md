# Phase 2B Implementation Report — Admin UI for Jenni Store Provisioning

> **Date**: 2026-06-16
> **Phase**: 2B — Admin UI for Jenni Store Provisioning
> **Status**: ✅ COMPLETED (pending supervisor review)
> **Build**: ✅ Backend compiles successfully
> **Tests**: ✅ 20/20 pass

---

## 1. Backend Endpoints — مراجع الكود الدقيقة

> ملف: [admin.controller.ts](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.controller.ts)

### 1.1 GET provisioning-status

[سطر 763-767](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.controller.ts#L763-L767):

```typescript
@Get("jenni/merchants/:id/provisioning-status")
@Roles("super_admin", "admin")                    // ← admin-only
getJenniProvisioningStatus(@Param("id") merchantId: string) {
  return this.adminService.getJenniProvisioningStatus(merchantId);
}
```

### 1.2 POST create-store

[سطر 769-773](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.controller.ts#L769-L773):

```typescript
@Post("jenni/merchants/:id/create-store")
@Roles("super_admin", "admin")                    // ← admin-only
createJenniStore(@Param("id") merchantId: string, @CurrentActor() actor: ActorContext) {
  return this.adminService.createJenniStore(merchantId, actor);
}
```

### 1.3 POST link-store

[سطر 775-783](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.controller.ts#L775-L783):

```typescript
@Post("jenni/merchants/:id/link-store")
@Roles("super_admin", "admin")                    // ← admin-only
linkJenniStore(
  @Param("id") merchantId: string,
  @Body() payload: { jenni_store_id: number },
  @CurrentActor() actor: ActorContext,
) {
  return this.adminService.linkJenniStore(merchantId, payload.jenni_store_id, actor);
}
```

### 1.4 تأكيد: الـ 3 endpoints **لا تقبل** merchant users أو public users

`@Roles("super_admin", "admin")` فقط.

في المقارنة، بعض endpoints الأخرى مثل `GET customers` (سطر 24) تسمح بـ `merchant_owner/merchant_manager/merchant_staff`.
الـ Jenni endpoints **لا تحتوي** على أي من هذه الأدوار.

```
grep -n "merchant_owner\|merchant_manager\|merchant_staff\|customer" → الأسطر 24, 111, 117 فقط
الأسطر 763-783 (Jenni) → لا نتائج
```

---

## 2. Admin Service — مراجع الكود الدقيقة

> ملف: [admin.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts)

### 2.1 getJenniProvisioningStatus

[سطر 1981-1984](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts#L1981-L1984):

```typescript
async getJenniProvisioningStatus(merchantId: string) {
  const status = await this.jenniStoreProvisioningService.getProvisioningStatus(merchantId);
  return status;
}
```

يستدعي `getProvisioningStatus` فقط (read-only).

### 2.2 createJenniStore

[سطر 1986-2007](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts#L1986-L2007):

```typescript
async createJenniStore(merchantId: string, actor: ActorContext) {
  const actorId = actor.actorId ?? "";
  const actorRole = actor.actorRole as AppActorRole;

  const result = await this.jenniStoreProvisioningService.ensureStoreForMerchant(merchantId);
  //              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //              يستدعي ensureStoreForMerchant فقط

  await this.auditService.log({
    eventType: "JENNI_STORE_PROVISIONED",
    actor: { actorId, actorRole },
    resource: { type: "merchant", id: merchantId },
    payload: {
      jenni_store_id: result.jenni_store_id,   // ← رقم فقط
      was_created: result.was_created,          // ← boolean فقط
    },
  });

  return { ok: true, jenni_store_id: result.jenni_store_id, was_created: result.was_created };
}
```

### 2.3 linkJenniStore

[سطر 2009-2024](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts#L2009-L2024):

```typescript
async linkJenniStore(merchantId: string, jenniStoreId: number, actor: ActorContext) {
  const actorId = actor.actorId ?? "";
  const actorRole = actor.actorRole as AppActorRole;

  await this.jenniStoreProvisioningService.linkExistingStore(merchantId, jenniStoreId);
  //    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //    يستدعي linkExistingStore فقط

  await this.auditService.log({
    eventType: "JENNI_STORE_LINKED_MANUALLY",
    actor: { actorId, actorRole },
    resource: { type: "merchant", id: merchantId },
    payload: { jenni_store_id: jenniStoreId },   // ← رقم فقط
  });

  return { ok: true, jenni_store_id: jenniStoreId };
}
```

### 2.4 تأكيد: لا hardcoded store_id=17025

```
grep -n "17025" admin.service.ts → لا نتائج
grep -n "17025" admin.controller.ts → لا نتائج
```

---

## 3. Frontend UI — مراجع الكود الدقيقة

> ملف: [MerchantDetail.tsx](file:///e:/Project/DilMart-Store/src/pages/admin/MerchantDetail.tsx)

### 3.1 الزر لا يشتغل تلقائيًا عند فتح الصفحة

عند فتح الصفحة، يتم استدعاء **GET فقط** (read-only):

[سطر 57-62](file:///e:/Project/DilMart-Store/src/pages/admin/MerchantDetail.tsx#L57-L62):

```typescript
const { data: jenniStatus, refetch: refetchJenni } = useQuery({
  queryKey: ["admin-jenni-provisioning", id],
  enabled: !!id,
  queryFn: () => apiClient.getJenniProvisioningStatus(id!), // ← GET فقط
  retry: 1,
});
```

**لا يوجد `useEffect` أو أي كود يستدعي `createJenniStore` أو `linkJenniStore` تلقائيًا.**

### 3.2 Create/Sync يحتاج click واضح

[سطر 148-166](file:///e:/Project/DilMart-Store/src/pages/admin/MerchantDetail.tsx#L148-L166) — `handleCreateJenniStore`:

```typescript
const handleCreateJenniStore = async () => {
  if (!id) return;
  setJenniSyncing(true);
  try {
    const result = await apiClient.createJenniStore(id);  // ← POST فقط عند click
    ...
```

الزر نفسه:

[سطر 372-379](file:///e:/Project/DilMart-Store/src/pages/admin/MerchantDetail.tsx#L372-L379):

```tsx
<Button
  id="btn-jenni-create-sync"
  size="sm"
  onClick={handleCreateJenniStore}   // ← يحتاج click
  disabled={jenniSyncing}
>
```

### 3.3 Link Existing يحتاج إدخال يدوي

[سطر 168-186](file:///e:/Project/DilMart-Store/src/pages/admin/MerchantDetail.tsx#L168-L186) — `handleLinkJenniStore`:

```typescript
const handleLinkJenniStore = async () => {
  if (!id || !jenniLinkId) return;           // ← يحتاج input
  const storeId = Number(jenniLinkId);
  if (!storeId || storeId <= 0) {            // ← validation
    toast.error("يرجى إدخال رقم Store صحيح");
    return;
  }
  ...
```

الـ Input + Button:

[سطر 393-410](file:///e:/Project/DilMart-Store/src/pages/admin/MerchantDetail.tsx#L393-L410):

```tsx
<Input
  id="input-jenni-link-id"
  placeholder="Jenni Store ID"
  value={jenniLinkId}
  onChange={(e) => setJenniLinkId(e.target.value)}  // ← إدخال يدوي
  type="number"
/>
<Button
  ...
  onClick={handleLinkJenniStore}
  disabled={jenniLinking || !jenniLinkId}  // ← لا يعمل بدون إدخال
>
```

### 3.4 لا credentials/token/password في UI

```
grep -in "password\|token\|secret\|credential\|17025" MerchantDetail.tsx → لا نتائج
```

---

## 4. Audit — مراجعة

### 4.1 Audit payload لا يحتوي credentials

**JENNI_STORE_PROVISIONED** (سطر 1996-1999):

```typescript
payload: {
  jenni_store_id: result.jenni_store_id,   // رقم فقط
  was_created: result.was_created,          // boolean فقط
}
```

**JENNI_STORE_LINKED_MANUALLY** (سطر 2019):

```typescript
payload: {
  jenni_store_id: jenniStoreId;
} // رقم فقط
```

✅ لا password، لا token، لا API key، لا credentials.

### 4.2 Audit types

[audit.types.ts سطر 15-16](file:///e:/Project/DilMart-Store/backend/src/modules/audit/audit.types.ts#L15-L16):

```typescript
| "JENNI_STORE_PROVISIONED"
| "JENNI_STORE_LINKED_MANUALLY";
```

---

## 5. نتائج الاختبارات

```
✅ Backend build: nest build → SUCCESS
✅ Tests: 20/20 pass (654ms)
```

| #   | Test                                                     | Category    | Result |
| --- | -------------------------------------------------------- | ----------- | ------ |
| 1   | load compiled admin service module                       | Setup       | ✅     |
| 2   | getProvisioningStatus returns linked status              | Status      | ✅     |
| 3   | getProvisioningStatus returns not linked status          | Status      | ✅     |
| 4   | getProvisioningStatus returns error state                | Status      | ✅     |
| 5   | createJenniStore delegates to ensureStoreForMerchant     | Create      | ✅     |
| 6   | createJenniStore returns was_created=false for existing  | Idempotency | ✅     |
| 7   | createJenniStore throws on validation failure            | Validation  | ✅     |
| 8   | linkJenniStore calls linkExistingStore with correct args | Link        | ✅     |
| 9   | linkJenniStore rejects duplicate store_id                | Duplicate   | ✅     |
| 10  | linkJenniStore rejects invalid store_id (zero)           | Validation  | ✅     |
| 11  | linkJenniStore rejects negative store_id                 | Validation  | ✅     |
| 12  | UI badge shows مربوط when is_linked=true                 | Badge       | ✅     |
| 13  | UI badge shows غير مربوط when is_linked=false            | Badge       | ✅     |
| 14  | UI badge shows خطأ when sync_error exists                | Badge       | ✅     |
| 15  | UI badge shows غير معروف when status is null             | Badge       | ✅     |
| 16  | UI badge error takes priority over linked                | Badge       | ✅     |
| 17  | create-store does not hardcode any store_id              | Safety      | ✅     |
| 18  | link-store requires explicit jenni_store_id              | Safety      | ✅     |
| 19  | admin endpoints use correct route paths                  | Structure   | ✅     |
| 20  | admin controller Jenni section has no dispatch/shipment  | Safety      | ✅     |

---

## 6. تأكيدات السلامة

| التأكيد                              | الحالة | الدليل                                                |
| ------------------------------------ | ------ | ----------------------------------------------------- |
| لا Store فعلي تم إنشاؤه              | ✅     | لم يُضغط أي زر                                        |
| لا استخدام `store_id=17025` تلقائيًا | ✅     | `grep "17025"` → 0 نتائج في admin + UI                |
| لا ربط `DilMart-primary`             | ✅     |                                                       |
| لا ربط `alarsh`                      | ✅     |                                                       |
| لا dispatch                          | ✅     | Test #20 يؤكد                                         |
| لا shipment                          | ✅     | Test #20 يؤكد                                         |
| لا finance changes                   | ✅     |                                                       |
| لا webhook changes                   | ✅     | Test #20 يؤكد                                         |
| لا credentials/token exposed         | ✅     | `grep "password\|token\|secret"` → 0 في Jenni section |
| Admin-only guard                     | ✅     | `@Roles("super_admin", "admin")` فقط                  |
| Audit logging — no secrets           | ✅     | Payload = `{ jenni_store_id, was_created }` فقط       |
| الزر لا يشتغل تلقائيًا               | ✅     | `onClick` فقط، لا `useEffect`                         |
| Link يحتاج إدخال يدوي                | ✅     | `disabled={!jenniLinkId}`                             |
