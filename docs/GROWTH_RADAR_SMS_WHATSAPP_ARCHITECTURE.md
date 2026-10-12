# Growth Radar — SMS & WhatsApp Campaigns Architecture & Launch Plan

**Status**: UI Placeholder & Waitlist Active | Backend Implementation Pending  
**Vendor**: MSG91 (Walkover Technologies Pvt. Ltd., India)

---

## 1. Overview & Current State

- **Current State**: Growth Radar sends Push Notifications only via Firebase FCM (included in Pro & Growth plans).
- **Upcoming Channels**: Promotional & Transactional SMS, Meta WhatsApp Business API broadcasts.
- **Current UI**:
  - Website: Shows "Coming Soon" with clock icon and development tooltip; no credit rates or pricing shown.
  - Admin App: Channel selection step inside Growth Radar campaign creation flow (`components/campaign-channel-select.tsx`).
    - Push Notification: Active & clickable -> proceeds to campaign builder.
    - SMS & WhatsApp: Disabled cards with "Notify Me When Ready" buttons that automatically build the tenant waitlist in Firestore.

---

## 2. Firestore Waitlist Schema

When a store owner clicks "Notify Me When Ready", the following documents are saved:

```typescript
// Primary Path:
clickout_meta/featureWaitlist/sms/{tenantId}
clickout_meta/featureWaitlist/whatsapp/{tenantId}

// Document Payload:
{
  tenantId: string,
  tenantName: string,
  registeredAt: Timestamp,
  plan: string,           // e.g. "pro" | "growth"
  requestedBy: string,    // admin email
  channel: "sms" | "whatsapp"
}
```

This builds an automatic launch list of ready-to-convert tenants.

---

## 3. Vendor Choice: MSG91

### Why MSG91:
1. **Indian Company**: INR billing, GST compliant invoices, no RBI auto-debit foreign exchange issues.
2. **Unified API**: Single API key for both transactional/promotional SMS and Meta WhatsApp Business API.
3. **DLT Compliance Engine**: Automated mapping of approved DLT entity and template IDs.

---

## 4. Regulatory & Prerequisite Steps (Before Launch)

### A. TRAI DLT Registration (Mandatory for Indian SMS)
Promotional SMS in India is strictly regulated by TRAI via Distributed Ledger Technology (DLT). Without registration, telecom operators (Jio, Airtel, Vi, BSNL) drop all messages at the gateway.

1. **Entity Registration**: Register ClickOut on Jio DLT, Airtel DLT, or Vilpower portal.
2. **Header (Sender ID) Registration**: Register 6-character sender ID (e.g., `CLKOUT`).
3. **Template Registration**: Submit message templates with dynamic variable brackets `{1}`, `{2}` for promotional coupons.
4. **Approval Timeline**: 3–7 working days per template.

### B. WhatsApp Business API Requirements (Meta)
1. Verified Meta Business Manager account with business registration documents.
2. WhatsApp Business Account (WABA) connected through MSG91.
3. Template approval in Meta Business Manager (Category: Marketing or Utility).
4. Meta approval SLA: 1–3 business days.

---

## 5. Cost Structure & Margins

| Channel | MSG91 Bulk Cost | Tenant Charge (Planned) | Gross Margin |
|---|---|---|---|
| Promotional SMS | ~₹0.12 – ₹0.15 / SMS | ₹0.20 / SMS | ~35% |
| WhatsApp Utility | ~₹0.35 – ₹0.45 / msg | ₹0.60 / msg | ~40% |
| WhatsApp Marketing | ~₹0.55 – ₹0.65 / msg | ₹0.60 – ₹0.75 / msg | ~30% – 40% |

### Credit Pack Model (Future Billing):
- **Pack 500 SMS**: ₹100 (`₹0.20/SMS`)
- **Pack 1,000 SMS**: ₹180 (`₹0.18/SMS` — volume discount)
- **Pack 100 WA**: ₹60 (`₹0.60/msg`)
- **Pack 500 WA**: ₹270 (`₹0.54/msg` — volume discount)

---

## 6. Files to Touch When Implementing Backend

1. `actions/growth-radar.ts` — Implement `sendSMS()` and `sendWhatsApp()` actions.
2. `lib/msg91.ts` — Wire actual MSG91 HTTP requests with `authKey` and template routing.
3. `components/campaign-builder/` — Enable SMS and WhatsApp composition forms (preview, dynamic variables).
4. `app/api/webhooks/msg91/route.ts` — Delivery receipts and status updates webhook handler.
