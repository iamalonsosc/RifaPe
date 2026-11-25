export function enlaceWhatsApp(texto: string, telefono = "") {
  const movil =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const url = movil
    ? new URL("https://wa.me/" + telefono)
    : new URL("https://web.whatsapp.com/send");
  if (!movil && telefono) url.searchParams.set("phone", telefono);
  url.searchParams.set("text", texto);
  return url.href;
}

export async function copiarMensaje(
  texto: string,
  avisar: (mensaje: string) => void,
) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar("Mensaje copiado. Puedes pegarlo en WhatsApp.");
  } catch {
    avisar(
      "El navegador no permitió copiar el mensaje. Revisa el permiso del portapapeles.",
    );
  }
}
