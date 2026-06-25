export function logIncomingMessage(value: Record<string, unknown>): void {
  const messages = value?.messages as Record<string, unknown>[] | undefined;
  const contacts = value?.contacts as Record<string, unknown>[] | undefined;
  const statuses = value?.statuses as Record<string, unknown>[] | undefined;

  logMessages(messages, contacts);
  logStatuses(statuses);
}

function logMessages(
  messages: Record<string, unknown>[] | undefined,
  contacts: Record<string, unknown>[] | undefined,
): void {
  if (!messages || !Array.isArray(messages)) return;

  const contact = contacts?.[0] as Record<string, unknown> | undefined;
  const profile = contact?.profile as Record<string, unknown> | undefined;
  const profileName = (profile?.name as string) ?? "Desconocido";

  for (const msg of messages) {
    const from = (msg.from as string) ?? "?";
    const type = (msg.type as string) ?? "unknown";

    switch (type) {
      case "text": {
        const text = msg.text as Record<string, unknown> | undefined;
        console.log(`[WHATSAPP] ${profileName} (${from}) dice: ${text?.body}`);
        break;
      }
      case "image": {
        const img = msg.image as Record<string, unknown> | undefined;
        console.log(
          `[WHATSAPP] ${profileName} (${from}) envió imagen [${img?.id}]` +
            (img?.caption ? ` — "${img.caption}"` : ""),
        );
        break;
      }
      case "audio": {
        const aud = msg.audio as Record<string, unknown> | undefined;
        console.log(
          `[WHATSAPP] ${profileName} (${from}) envió audio [${aud?.id}]`,
        );
        break;
      }
      case "video": {
        const vid = msg.video as Record<string, unknown> | undefined;
        console.log(
          `[WHATSAPP] ${profileName} (${from}) envió video [${vid?.id}]` +
            (vid?.caption ? ` — "${vid.caption}"` : ""),
        );
        break;
      }
      case "document": {
        const doc = msg.document as Record<string, unknown> | undefined;
        console.log(
          `[WHATSAPP] ${profileName} (${from}) envió documento [${doc?.id}]` +
            ` — ${doc?.filename ?? "sin nombre"}`,
        );
        break;
      }
      case "location": {
        const loc = msg.location as Record<string, unknown> | undefined;
        console.log(
          `[WHATSAPP] ${profileName} (${from}) envió ubicación: ` +
            `${loc?.latitude}, ${loc?.longitude}`,
        );
        break;
      }
      case "button": {
        const btn = msg.button as Record<string, unknown> | undefined;
        console.log(
          `[WHATSAPP] ${profileName} (${from}) presionó botón ` +
            `"${btn?.text}" → payload: ${btn?.payload}`,
        );
        break;
      }
      case "interactive": {
        console.log(
          `[WHATSAPP] ${profileName} (${from}) respuesta interactiva ` +
            `— ${JSON.stringify(msg.interactive)}`,
        );
        break;
      }
      case "reaction": {
        const rxn = msg.reaction as Record<string, unknown> | undefined;
        console.log(
          `[WHATSAPP] ${profileName} (${from}) reaccionó con ` +
            `"${rxn?.emoji}" al msg ${rxn?.message_id}`,
        );
        break;
      }
      case "order":
        console.log(
          `[WHATSAPP] ${profileName} (${from}) envió pedido ` +
            `— ${JSON.stringify(msg.order)}`,
        );
        break;

      default:
        console.log(
          `[WHATSAPP] ${profileName} (${from}) tipo "${type}" ` +
            `— ${JSON.stringify(msg)}`,
        );
    }
  }
}

function logStatuses(
  statuses: Record<string, unknown>[] | undefined,
): void {
  if (!statuses || !Array.isArray(statuses)) return;
  for (const st of statuses) {
    console.log(
      `[WHATSAPP-STATUS] Msg ${st.id}: ${st.status}` +
        (st.recipient_id ? ` → ${st.recipient_id}` : ""),
    );
  }
}
