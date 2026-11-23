import { useState, useEffect } from "react";
import { Accion } from "./controles";
import {
  filas,
  rpc,
  numero,
  type Premio,
  type Rifa,
  type Fila,
  type Numero,
} from "./datos";
export function Sorteo({
  r,
  premios,
  version,
  recargar,
}: {
  r: Rifa;
  premios: Premio[];
  version: number;
  recargar: () => void;
}) {
  const [extracciones, set] = useState<Fila[]>([]),
    [ns, numeros] = useState<Numero[]>([]),
    [ganadores, resultados] = useState<Fila[]>([]),
    [err, error] = useState(""),
    [listo, preparar] = useState(false);
  useEffect(() => {
    let vivo = true;
    preparar(false);
    async function cargar() {
      const f: [string, string] = ["id_rifa", r.id_rifa];
      const ss = await filas<Fila>("sorteo", f);
      const [e, n, g] = await Promise.all([
        ss.length
          ? filas<Fila>(
              "extraccion_sorteo",
              ["id_sorteo", String(ss[0].id_sorteo)],
              "fecha_extraccion",
            )
          : [],
        filas<Numero>("numero_rifa", f, "numero"),
        filas<Fila>("vw_historial_ganadores", f, "orden_sorteo"),
      ]);
      if (vivo) {
        set(e);
        numeros(n);
        resultados(g);
        preparar(true);
        error("");
      }
    }
    void cargar().catch((e) => error(e.message));
    return () => {
      vivo = false;
    };
  }, [r.id_rifa, version]);
  const clave = "premio-en-pantalla:" + r.id_rifa;
  const [visible, seleccionar] = useState(
    () => sessionStorage.getItem(clave) || "",
  );
  function mostrar(id: string) {
    seleccionar(id);
    sessionStorage.setItem(clave, id);
  }
  const pendiente = premios.find(
    (p) => !ganadores.some((g) => Number(g.orden_sorteo) === p.orden_sorteo),
  );
  const p =
    premios.find((p) => p.id_premio_rifa === visible) ??
    pendiente ??
    premios.at(-1);
  const ganador = ganadores.find(
    (g) => Number(g.orden_sorteo) === p?.orden_sorteo,
  );
  const pasos = extracciones.filter(
    (e) => e.id_premio_rifa === p?.id_premio_rifa,
  );
  const ultimo = pasos.at(-1),
    orden = pasos.length + 1;
  const valor = (e: Fila) =>
    numero(ns.find((n) => n.id_numero_rifa === e.id_numero_rifa)?.numero || 0);
  return (
    <>
      <section className="transmision">
        <p className="ceja">SORTEO OFICIAL</p>
        {err && <p role="alert">{err}</p>}
        {r.estado === "activa" ? (
          <>
            <h2>Iniciar sorteo</h2>
            <p>
              Al iniciar se cierran las ventas y se fijan los premios y los
              números pagados.
            </p>
            {listo && (
              <Accion
                texto="Iniciar sorteo oficial"
                ejecutar={async () => {
                  if (!confirm("¿Cerrar ventas e iniciar el sorteo oficial?"))
                    throw Error("El sorteo sigue pendiente.");
                  await rpc("iniciar_sorteo", { p_rifa: r.id_rifa });
                  recargar();
                }}
              />
            )}
          </>
        ) : r.estado === "terminada" ? (
          <h2>Sorteo terminado</h2>
        ) : listo && p ? (
          <>
            <h2>{p.es_sorpresa && !ganador ? "Premio sorpresa" : p.nombre}</h2>
            {p.imagen_url && (!p.es_sorpresa || ganador) && (
              <img className="foto-sorteo" src={p.imagen_url} alt={p.nombre} />
            )}
            {ganador ? (
              <div aria-live="polite">
                <p>Ganador</p>
                <div className="bola">
                  {numero(Number(ganador.numero))} · {ganador.participante}
                </div>
                {pendiente ? (
                  <button
                    className="principal"
                    onClick={() => mostrar(pendiente.id_premio_rifa)}
                  >
                    Siguiente premio
                  </button>
                ) : (
                  <Accion
                    texto="Finalizar sorteo"
                    ejecutar={async () => {
                      await rpc("finalizar_sorteo", { p_rifa: r.id_rifa });
                      recargar();
                    }}
                  />
                )}
              </div>
            ) : (
              <>
                {p.numero_extraccion_ganadora > 1 && (
                  <p>
                    {ultimo
                      ? "Salió el " + valor(ultimo) + " en la ronda anterior. "
                      : ""}
                    {orden === p.numero_extraccion_ganadora
                      ? "Esta ronda elige al ganador."
                      : "Ronda " +
                        orden +
                        " de " +
                        p.numero_extraccion_ganadora +
                        ". El ganador se elige en la última ronda."}
                  </p>
                )}
                <Accion
                  texto="Realizar sorteo"
                  ejecutar={async () => {
                    mostrar(p.id_premio_rifa);
                    try {
                      await rpc("extraer_numero_sorteo", {
                        p_rifa: r.id_rifa,
                        p_premio: p.id_premio_rifa,
                        p_orden: orden,
                        p_solicitud: crypto.randomUUID(),
                      });
                    } finally {
                      recargar();
                    }
                  }}
                />
              </>
            )}
          </>
        ) : (
          <p>Cargando premio…</p>
        )}
      </section>
      <h2>Ganadores</h2>
      {ganadores.map((g) => (
        <p key={String(g.orden_sorteo)}>
          {g.premio} · {numero(Number(g.numero))} · {g.participante}
        </p>
      ))}
      <h2>Historial de extracciones</h2>
      {extracciones
        .slice()
        .reverse()
        .map((e) => (
          <p key={String(e.id_extraccion)}>
            {premios.find((p) => p.id_premio_rifa === e.id_premio_rifa)?.nombre}{" "}
            · Extracción {e.orden_extraccion} · {valor(e)} ·{" "}
            {e.es_ganadora ? "Ganadora" : "Descarte"}
          </p>
        ))}
    </>
  );
}
