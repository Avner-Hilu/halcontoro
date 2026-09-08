/** Public site origin for shareable invite links (WhatsApp etc.). */
export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return origin;
    }
  }

  return "https://halcontoro.avner-hilu.workers.dev";
}

export function roomInviteUrl(code: string): string {
  return `${getPublicSiteOrigin()}/play/online?code=${encodeURIComponent(code)}`;
}

export function whatsAppInviteText(code: string): string {
  const link = roomInviteUrl(code);
  // Put the https URL alone on its own line so WhatsApp makes it tappable.
  return `בואו נשחק HALCON-TORO!\nקוד חדר: ${code}\n\n${link}`;
}

export function openWhatsAppInvite(code: string): void {
  const text = whatsAppInviteText(code);
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer",
  );
}
