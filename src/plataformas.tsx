import type { Ticket } from "./datos";

export const nombresPlataforma: Record<string, string> = {
  presencial: "Presencial", teams: "Microsoft Teams", tiktok: "TikTok",
  meet: "Google Meet", otro: "Otra plataforma",
};

export function plataformaDe(b: Ticket) {
  if (!b.destino?.startsWith("https://") || b.modalidad === "presencial") return;
  let host: string;
  try {
    host = new URL(b.destino).hostname.replace(/^www\./, "");
  } catch {
    return;
  }
  const tipo = b.modalidad && b.modalidad !== "otro" ? b.modalidad
    : host === "meet.google.com" ? "meet"
    : /(^|\.)tiktok\.com$/.test(host) ? "tiktok"
    : /^teams\.(microsoft\.com|live\.com|cloud\.microsoft)$/.test(host) ? "teams"
    : "otro";
  const nombre = tipo === "otro"
    ? host.split(".")[0].replace(/^./, letra => letra.toUpperCase())
    : nombresPlataforma[tipo];
  return { tipo, nombre };
}

export function PlataformaBoleto({ b }: { b: Ticket }) {
  const plataforma = plataformaDe(b);
  if (!plataforma) return null;
  return <a className="plataforma-boleto" href={b.destino} target="_blank" rel="noreferrer">
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      {plataforma.tipo === "teams" ? <>
        <circle cx="15" cy="5" r="3.5" fill="#a6a7dc"/><circle cx="21" cy="7" r="2.3" fill="#8586c8"/>
        <path fill="#7375bf" d="M18 10h6v5a3 3 0 0 1-6 0z"/><path fill="#8587ce" d="M8 10h12v6a6 6 0 0 1-12 0z"/>
        <rect x="1" y="7" width="13" height="13" rx="2" fill="#5054aa"/><path stroke="white" strokeWidth="2" d="M4 11h7m-3.5 0v6"/>
      </> : plataforma.tipo === "meet" ? <>
        <path fill="#4285f4" d="M1 7h5v13H2l-1-1z"/><path fill="#ea4335" d="m1 7 5-5v5z"/>
        <path fill="#fbbc04" d="M6 2h11l2 2v4H6z"/><path fill="#34a853" d="M6 16h9v-5l4 4v5l-2 2H6z"/>
        <path fill="#00832d" d="m14 11 9-7v16l-9-7z"/>
      </> : plataforma.tipo === "tiktok" ? <>
        <rect width="24" height="24" rx="5" fill="#111"/>
        <path d="M14 4v11a4 4 0 1 1-4-4m4-7c0 3 2 5 6 5" fill="none" stroke="#25f4ee" strokeWidth="3.5"/>
        <path d="M15 4v11a4 4 0 1 1-4-4m4-7c0 3 2 5 6 5" fill="none" stroke="white" strokeWidth="2.5"/>
      </> : <g fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></g>}
    </svg>
    {plataforma.nombre}
  </a>;
}
