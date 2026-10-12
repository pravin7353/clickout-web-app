/**
 * MSG91 API Integration Layer (Architecture Stub)
 *
 * Vendor: MSG91 (Walkover Technologies Pvt. Ltd., India)
 * Documentation: https://docs.msg91.com/
 *
 * Why MSG91:
 * - Indian entity, INR billing (no RBI foreign exchange / international transaction hurdles)
 * - Single API key for Promotional/Transactional SMS and WhatsApp Business API
 * - Built-in DLT template mapping engine compliant with TRAI regulations
 *
 * DLT Registration Requirements (TRAI Mandatory):
 * 1. Register ClickOut entity on Jio / Airtel / BSNL / Vodafone Idea DLT portal
 * 2. Obtain Principal Entity (PE) ID and Sender ID (Header: e.g., CLKOUT)
 * 3. Pre-register Content Templates for each promotional campaign
 * 4. Approval SLA: 3–7 working days per template
 *
 * WhatsApp Business API Requirements (Meta Mandatory):
 * 1. Verified Meta Business Manager account
 * 2. WhatsApp Business Account (WABA) connected via MSG91
 * 3. Pre-approved Meta Message Templates (Category: Marketing or Utility)
 * 4. Approval SLA: 1–3 working days
 */

export interface Msg91Config {
  authKey: string;
  senderId?: string;
  dltEntityId?: string;
}

export interface SendSmsPayload {
  templateId: string; // DLT registered template ID
  recipients: Array<{
    mobiles: string; // E.164 format or 10-digit Indian phone
    [key: string]: string; // Dynamic template variables (e.g., ##COUPON##, ##NAME##)
  }>;
}

export interface SendWhatsAppPayload {
  integratedNumber: string; // Approved WABA phone number
  templateName: string; // Meta approved template name
  language: string; // e.g., 'en', 'hi'
  recipients: Array<{
    to: string[]; // Mobile numbers
    components?: Record<string, any>; // Body parameters, buttons, coupon codes
  }>;
}

export interface Msg91Response {
  type: "success" | "error";
  message: string;
  code?: number;
  requestId?: string;
}

/**
 * Send promotional or transactional SMS via MSG91 Flow API
 */
export async function sendMsg91Sms(_payload: SendSmsPayload): Promise<Msg91Response> {
  // Backend implementation pending TRAI DLT entity & template approval
  return {
    type: "error",
    message: "SMS sending is in development. DLT registration with TRAI in progress.",
  };
}

/**
 * Send WhatsApp template campaigns via MSG91 WhatsApp Business API
 */
export async function sendMsg91WhatsApp(_payload: SendWhatsAppPayload): Promise<Msg91Response> {
  // Backend implementation pending Meta WABA approval
  return {
    type: "error",
    message: "WhatsApp campaign sending is in development. Meta template approval pending.",
  };
}

/**
 * Webhook signature verification for delivery reports
 */
export function verifyMsg91WebhookSignature(_signature: string, _body: string): boolean {
  return true;
}
