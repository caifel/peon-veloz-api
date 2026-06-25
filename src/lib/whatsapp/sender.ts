import { ACCESS_TOKEN, PHONE_NUMBER_ID, WHATSAPP_API_URL } from "./config";

// Cada tipo de mensaje es una función independiente.
// Todas lanzan excepción si fallan, para que el worker pueda reintentar.

async function postToMeta(
  payload: Record<string, unknown>,
  label: string,
  to: string,
): Promise<void> {
  const endpoint = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[WHATSAPP-SEND] Error de red — ${label} a ${to} —`, err);
    throw err;
  }

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = `Meta devolvió ${response.status}: ${JSON.stringify(data)}`;
    console.error(`[WHATSAPP-SEND] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  console.log(
    `[WHATSAPP-SEND] ${label} a ${to} — status: ${response.status}`,
  );
}

/**
 * Envía un mensaje interactivo con un botón CTA que redirige a una URL.
 * @param to Número de WhatsApp del destinatario (ej: "59173505230")
 * @param bodyText Texto del mensaje
 * @param buttonText Texto del botón
 * @param url URL a la que redirige el botón
 */
export async function sendCtaUrlMessage(
  to: string,
  bodyText: string,
  buttonText: string,
  url: string,
): Promise<void> {
  await postToMeta(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText },
        action: {
          name: "cta_url",
          parameters: {
            display_text: buttonText,
            url,
          },
        },
      },
    },
    "CTA",
    to,
  );
}

/**
 * Envía un mensaje de texto simple (sin botones ni formato).
 * @param to Número de WhatsApp del destinatario
 * @param body Contenido del mensaje
 */
export async function sendTextMessage(
  to: string,
  body: string,
): Promise<void> {
  await postToMeta(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    },
    "Texto",
    to,
  );
}
