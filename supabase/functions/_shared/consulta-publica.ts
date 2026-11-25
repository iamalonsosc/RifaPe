import { createClient } from "npm:@supabase/supabase-js@2";
export function atenderConsulta(
  consulta: "consultar_boleto" | "consultar_disponibilidad",
) {
  Deno.serve(async (req) => {
    const headers = {
      "Access-Control-Allow-Origin": Deno.env.get("ORIGEN_APLICACION") ?? "",
      "Access-Control-Allow-Headers":
        "content-type, apikey, authorization, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    const responder = (valor: unknown, status: number) =>
      new Response(JSON.stringify(valor), { status, headers });
    if (req.method === "OPTIONS") return new Response(null, { headers });
    if (req.method !== "POST") return responder(null, 405);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Conserva solo un hash temporal del origen que entrega el proxy.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
      "compartido";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ip),
    );
    const clave = Array.from(new Uint8Array(digest), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
    const limite = await db.rpc("permitir_consulta", { p_clave: clave });
    if (limite.error) return responder(null, 503);
    if (!limite.data) return responder(null, 429);
    const cuerpo = await req.json().catch(() => null);
    if (
      typeof cuerpo?.token !== "string" ||
      !/^\w{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        cuerpo.token,
      ) ||
      !/^[0-9a-f-]+$/i.test(cuerpo.token)
    )
      return responder(null, 400);
    const { data, error } = await db.rpc(consulta, {
      p_token: cuerpo.token,
    });
    return responder(error ? null : data, error ? 503 : data ? 200 : 404);
  });
}
