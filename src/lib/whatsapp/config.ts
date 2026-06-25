// Token para validar el handshake GET del webhook
export const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

// Secreto para validar la firma HMAC-SHA256 de cada POST
export const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "";

// Token de acceso a la WhatsApp Cloud API (envío de mensajes)
export const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";

// ID del número de WhatsApp Business (desde el panel de Meta)
export const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

// URL base de la Graph API de Meta (la versión se actualiza periódicamente)
export const WHATSAPP_API_URL =
  process.env.WHATSAPP_API_URL ?? "https://graph.facebook.com/v22.0";
