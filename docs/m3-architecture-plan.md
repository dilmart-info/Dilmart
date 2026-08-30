# 🚀 M3 Architecture Plan

## M3 — Merchant Operations & Commercial Readiness Layer

---

## 1) Context

بعد M1 وM2 أصبح النظام يغطي:

### من جهة المستخدم العام

- Homepage Marketplace
- Product listing
- Search contract مستقر
- Merchant discovery
- Storefront واضح
- Product detail أقوى تحويليًا
- Growth hooks foundation

### من جهة المعمارية

- Backend-first
- Contracts منضبطة
- Query discipline أفضل
- Legacy public catalog مفصول
- Routing canonical واضح

لكن ما زال ينقص المنصة عنصر أساسي:

> **التميّز للتاجر والتشغيل التجاري اليومي، وليس فقط للمستخدم النهائي**

---

## 2) Objective

تحويل المنصة من:

> **Marketplace جيد في الواجهة العامة**

إلى:

> **Marketplace جاهز تجاريًا وتشغيليًا للتجار والإدارة والنمو المنظم**

عبر بناء طبقات:

- Merchant operations clarity
- Catalog governance
- Merchandising controls
- Lightweight commercial tooling
- Store readiness discipline
- Platform control surfaces

---

## 3) Non-Goals

M3 **لا تشمل**:

- عمولات وتسويات مالية كاملة
- محرك شحن/توصيل متقدم
- Payments expansion
- Recommendation engine
- Marketing automation
- Reviews / ratings إذا لم تُفتح صراحة لاحقًا
- Native apps
- Full BI/analytics warehouse

هذه لمراحل لاحقة.

---

## 4) Strategic Goal of M3

إذا كان:

- **M1** = Public marketplace foundation
- **M2** = Discovery + conversion + growth hooks

فإن:

- **M3** = **Merchant-side operational maturity**

أي:

- ما يراه التاجر
- ما يضبط جودة الكتالوج
- ما يجعل المتجر “جاهزًا للبيع”
- ما يسمح للإدارة بضبط الجودة والظهور والجاهزية

---

## 5) M3 Phase Structure

### 🧩 Batch M3.0 — Merchant Operations Audit

**الهدف:** فهم الفجوات التشغيلية الحالية للتاجر قبل أي تحسين.

**المطلوب (Audit شامل):**

- merchant dashboard
- products management
- storefront readiness
- coupons/promotions الحالية
- order handling touchpoints
- merchant settings
- admin visibility/control gaps

**الأسئلة الأساسية:**

- أين يتعطل التاجر؟
- أين الواجهة ناقصة؟
- ما الذي يضعف readiness؟
- ما الذي يسبب catalog inconsistency؟
- ما الذي يجعل التاجر لا يفهم كيف يبيع أفضل؟

**المخرجات:**

- Merchant Operations Audit Report
- Readiness gaps
- Commercial tooling gaps
- Admin control gaps

**DoD:**

- تقرير تنفيذي واضح
- أولويات مرتبة
- لا اقتراحات عشوائية

---

### 🧩 Batch M3.1 — Store Readiness Contract

**الهدف:** تعريف متى يكون المتجر “جاهزًا للبيع” فعليًا.

**المطلوب:** إنشاء contract واضح لمفهوم **Store Readiness**.

**قد يشمل:**

- store has logo
- store has description
- store has at least N active products
- store has at least one public category
- store is active
- storefront content is non-empty
- optional: has featured imagery

**النتيجة:**

بدل أن يكون store “active” فقط تقنيًا، يصبح:

- active
- and commercially ready

**DoD:**

- readiness contract موثق
- readiness computation واضحة
- لا خلط بين status التشغيلي وreadiness التجاري

---

### 🧩 Batch M3.2 — Catalog Quality & Product Readiness

**الهدف:** تقوية جودة المنتجات المعروضة ووضوحها.

**المطلوب:** تعريف **Product Readiness / Quality Rules** مثل:

- name موجود وواضح
- price صالح
- image موجودة
- category موجودة
- stock state واضح
- description optional/required حسب القرار
- merchant linkage صحيح

**مطلوب إضافي:**

Surface بسيطة للتاجر أو الأدمن تُظهر:

- incomplete products
- low-quality products
- missing media
- missing category

**DoD:**

- product readiness rules
- quality gaps visible
- no hidden low-quality catalog state

---

### 🧩 Batch M3.3 — Merchant Dashboard Clarity Layer

**الهدف:** تحويل لوحة التاجر من “صفحات موجودة” إلى “cockpit واضح”.

**المطلوب:** تحسين merchant-side overview لعرض:

- store status
- readiness
- active products count
- missing setup actions
- orders summary (عند الحاجة)
- coupons/promotions summary
- quick actions

**مهم:** ليست dashboard analytics متقدمة، بل **operational clarity dashboard**.

**DoD:**

- التاجر يفهم حالته في أول نظرة
- quick actions واضحة
- no dead admin-style clutter

---

### 🧩 Batch M3.4 — Catalog Management Tightening

**الهدف:** رفع جودة إدارة المنتجات بدون بناء نظام PIM كامل.

**المطلوب:**

- review product create/edit UX
- تحسين validation clarity
- تحسين publish/unpublish behavior
- منع الحالات المربكة:
  - active with missing fields
  - hidden but incomplete flags
- تحسين bulk hygiene إن وُجدت لاحقًا

**DoD:**

- create/edit flows أوضح
- catalog state أقل فوضى
- merchant mistakes أصعب

---

### 🧩 Batch M3.5 — Merchant Merchandising Controls

**الهدف:** إعطاء التاجر أدوات بسيطة لكن فعالة للتأثير في واجهته وظهوره.

**المطلوب (ضمن حدود معقولة):**

- featured products داخل المتجر
- ordering داخل storefront إن كان مناسبًا
- control واضح على:
  - new
  - best seller
  - featured
  - offers qualification visibility
- بدون فوضى labels أو signals

**مهم جدًا:** هذه المرحلة تبني على M2.2 ولا تكسرها.

**DoD:**

- التاجر/الأدمن يفهم الإشارات
- لا يوجد تضارب بين copy وsignal
- controls منضبطة وليست عشوائية

---

### 🧩 Batch M3.6 — Coupon / Offer Commercial Clarity

**الهدف:** تقوية الوضوح التجاري للعروض والكوبونات.

**المطلوب:**

- audit + tightening لـ:
  - coupon visibility
  - merchant offer understanding
  - discount presentation logic
- clarification layer:
  - ما الذي يظهر كعرض؟
  - ما الذي يبقى مجرد discount داخلي؟
  - كيف يرى التاجر أثر ذلك؟

**ليست المرحلة:** promotions engine متقدم؛ الهدف **commercial clarity**.

**DoD:**

- offer/coupon behavior أوضح
- no misleading discount state
- merchant mental model واضح

---

### 🧩 Batch M3.7 — Merchant-to-Platform Control Boundaries

**الهدف:** توضيح الحدود بين تحكم التاجر وتحكم المنصة/الأدمن.

**المطلوب:** توثيق وتنفيذ boundaries مثل:

- من يحدد featured merchant؟
- من يحدد featured products؟
- من يملك signals معينة؟
- من يغير store status؟
- من يقرر visibility في marketplace home / stores؟

**النتيجة:** توقف الفوضى السياسية بين platform وmerchant.

**DoD:**

- ownership map واضح
- permissions model أوضح
- no hidden shared-control ambiguity

---

### 🧩 Batch M3.8 — Admin Marketplace Governance Layer

**الهدف:** بناء طبقة governance خفيفة للإدارة.

**المطلوب للأدمن:**

- رؤية stores الجاهزة وغير الجاهزة
- رؤية catalog quality gaps
- رؤية merchants lacking minimum readiness
- maybe quick moderation flags
- simple control surfaces for marketplace visibility

**ليس المطلوب:**

- admin BI كامل
- finance console
- full moderation suite

**DoD:**

- الإدارة ترى جودة السوق
- وتعرف أين تتدخل
- بدون overload

---

### 🧩 Batch M3.9 — Commercial Readiness Closure

**الهدف:** إغلاق المرحلة على شكل rulebook واضح.

**المطلوب:** تجميع:

- readiness contracts
- governance rules
- merchant control rules
- catalog quality rules
- visibility rules

في وثيقة تشغيلية واحدة:

> **Marketplace Commercial Readiness Rulebook**

**DoD:**

- وثيقة واحدة مرجعية
- قابلة للتنفيذ
- تستخدم لاحقًا في M4 / finance / ops / onboarding

---

## 6) Execution Rules

1. دفعة واحدة فقط كل مرة (مثل M0 وM1 وM2).
2. كل دفعة تبدأ بـ:
   - audit / pre-plan
   - scope
   - risks
   - DoD
3. لا تتحول M3 إلى redesign شامل؛ التركيز على:
   - readiness
   - controls
   - operational clarity
4. لا تدخلوا finance الثقيلة الآن:
   - settlements
   - merchant payouts
   - commissions engine
5. لا تكسروا contracts السابقة خصوصًا:
   - M1 canonical public surfaces
   - M2 ranking/search contracts

---

## 7) Suggested Order of Execution

1. **M3.0** — Merchant Operations Audit
2. **M3.1** — Store Readiness Contract
3. **M3.2** — Catalog Quality & Product Readiness
4. **M3.3** — Merchant Dashboard Clarity Layer
5. **M3.4** — Catalog Management Tightening
6. **M3.5** — Merchant Merchandising Controls
7. **M3.6** — Coupon / Offer Commercial Clarity
8. **M3.7** — Merchant-to-Platform Control Boundaries
9. **M3.8** — Admin Marketplace Governance Layer
10. **M3.9** — Commercial Readiness Closure

---

## 8) Closure Criteria for M3

تُعتبر M3 مغلقة عندما:

- أصبح هناك تعريف واضح لـ:
  - store readiness
  - product readiness
  - catalog quality
  - visibility ownership
- التاجر يفهم حالته التشغيلية والتجارية
- الإدارة ترى جودة السوق بوضوح
- controls أصبحت واضحة بدل أن تكون scattered
- marketplace أصبحت أقرب إلى:
  - **operationally manageable**
  - وليس فقط publicly usable

---

## 9) Final Interpretation

إذا كان:

- **M1** = بناء السطح العام
- **M2** = تحسين الاكتشاف والتحويل والنمو التأسيسي

فإن:

- **M3** = جعل السوق **قابلًا للإدارة التجارية والتشغيلية الفعلية**

وهذه مرحلة شديدة الأهمية لأنها تمنع المنصة من أن تتحول إلى:

> واجهة جميلة فوق فوضى تشغيلية

