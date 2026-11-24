import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && clave ? createClient(url, clave) : null;
export type Fila = { [campo: string]: string | number | boolean | null };
export interface Rifa {
  token_consulta?: string;
  id_rifa: string;
  nombre: string;
  descripcion: string | null;
  precio_numero: number;
  cantidad_numeros: number;
  fecha_sorteo: string;
  regla_ganador: string;
  estado: string;
  imagen_premio_url: string | null;
}
export interface Premio {
  id_premio_rifa: string;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  orden_sorteo: number;
  numero_extraccion_ganadora: number;
  es_sorpresa: boolean;
  prioridad: number | null;
  estado: string;
}
export interface Persona {
  id_persona: string;
  nombres: string;
  apellidos: string | null;
  telefono: string | null;
}
export interface Numero {
  id_numero_rifa: string;
  numero: number;
  estado: string;
}
export interface Visual {
  mostrar_fotos_premios?: boolean;
  titulo: string;
  tema: string;
  mostrar_premio: boolean;
  mostrar_lugar: boolean;
  mostrar_qr: boolean;
  fondo_url: string | null;
}
export interface Ticket {
  numeros?: number[];
  codigo_grupo?: string;
  estado_rifa?: string;
  estados_numeros?: { numero: number; estado_numero: string }[];
  participante: string;
  numero: number;
  rifa: string;
  fecha: string;
  premio: string;
  destacados?: string[];
  fotos_destacadas?: (string | null)[];
  mas_premios?: boolean;
  imagen?: string | null;
  telefono?: string | null;
  plantilla: Visual;
  estado: string;
  codigo: string;
  direccion?: string;
  modalidad?: string;
  destino?: string;
}
export interface Boleto {
  id_detalle_venta: string | null;
  token_publico: string;
  estado: string;
  datos_emision_historicos: Ticket;
}
export async function filas<T>(
  tabla: string,
  filtro?: [string, string],
  orden?: string,
): Promise<T[]> {
  if (!db) throw Error("Configura las variables de Supabase.");
  const resultado: T[] = [];
  for (let desde = 0; ; desde += 500) {
    let consulta = db.from(tabla).select("*");
    if (filtro) consulta = consulta.eq(...filtro);
    if (orden) consulta = consulta.order(orden);
    const { data, error } = await consulta.range(desde, desde + 499);
    if (error) throw Error(error.message);
    resultado.push(...(data as T[]));
    if (data.length < 500) return resultado;
  }
}
export async function rpc<T = unknown>(
  nombre: string,
  parametros: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db!.rpc(nombre, parametros);
  if (error) throw Error(error.message);
  return data as T;
}
export const soles = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    n,
  );
export const fecha = (v: string) =>
  new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(v));
export const numero = (n: number) => String(n).padStart(3, "0");
export const nombre = (p: Persona) =>
  [p.nombres, p.apellidos].filter(Boolean).join(" ");
export const localPeru = (v: string) =>
  new Date(new Date(v).valueOf() - 5 * 3600000).toISOString().slice(0, 16);
export const campo = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export async function imagen(
  f: FormData,
  key: string,
  actual: string | null = null,
) {
  const file = f.get(key);
  if (!(file instanceof File) || !file.size) return actual;
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5242880
  )
    throw Error("Selecciona una imagen PNG, JPEG o WebP de hasta 5 MB.");
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  const {
    data: { user },
  } = await db!.auth.getUser();
  if (!user) throw Error("Inicia sesión.");
  const ruta =
    user.id + "/" + crypto.randomUUID() + "." + file.type.split("/")[1];
  const bucket = db!.storage.from("rifafacil-imagenes");
  const { error } = await bucket.upload(ruta, file);
  if (error) throw Error(error.message);
  return bucket.getPublicUrl(ruta).data.publicUrl;
}
