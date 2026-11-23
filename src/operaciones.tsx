import { useEffect, useState } from "react";
import { Campo, Formulario, Accion } from "./controles";
import {
  campo,
  filas,
  rpc,
  nombre,
  numero,
  soles,
  fecha,
  type Rifa,
  type Numero,
  type Persona,
  type Fila,
} from "./datos";
import { SeleccionPersona } from "./seleccion-persona";
export function Operaciones({
  r,
  version,
  recargar,
}: {
  r: Rifa;
  version: number;
  recargar: () => void;
}) {
  const [ns, poner] = useState<Numero[]>([]),
    [ps, personas] = useState<Persona[]>([]),
    [vs, ventas] = useState<Fila[]>([]),
    [rs, reservas] = useState<Fila[]>([]),
    [ds, detalles] = useState<Fila[]>([]),
    [pend, saldos] = useState<Fila[]>([]),
    [dev, devoluciones] = useState<Fila[]>([]),
    [pagos, cobros] = useState<Fila[]>([]);
  const [comprador, seleccionar] = useState<Persona | null>(null);
  const [sel, elegir] = useState<string[]>([]),
    [filtro, filtrar] = useState("todos"),
    [pagina, paginar] = useState(0),
    [modo, modoVenta] = useState("venta"),
    [err, error] = useState("");
  useEffect(() => {
    let vivo = true;
    const f: [string, string] = ["id_rifa", r.id_rifa];
    Promise.all([
      filas<Numero>("numero_rifa", f, "numero"),
      filas<Persona>("persona", undefined, "id_persona"),
      filas<Fila>("venta", f, "id_venta"),
      filas<Fila>("reserva", f, "id_reserva"),
      filas<Fila>("detalle_reserva", undefined, "id_detalle_reserva"),
      filas<Fila>("vw_pagos_pendientes", f, "id_venta"),
      filas<Fila>("devolucion", undefined, "id_devolucion"),
      filas<Fila>("pago", undefined, "id_pago"),
    ])
      .then(([n, p, v, b, d, s, h, c]) => {
        if (vivo) {
          poner(n);
          personas(p);
          ventas(v);
          reservas(b);
          detalles(d);
          saldos(s);
          devoluciones(h);
          cobros(c);
          error("");
        }
      })
      .catch((e) => error(e.message));
    return () => {
      vivo = false;
    };
  }, [r.id_rifa, version]);
  const abiertos = r.estado === "activa",
    nombreDe = (id: unknown) => {
      const p = ps.find((p) => p.id_persona === id);
      return p ? nombre(p) : "Participante";
    },
    visibles = ns.filter((n) => filtro === "todos" || filtro === n.estado);
  async function ejecutar(fn: string, args: Record<string, unknown>) {
    try {
      await rpc(fn, args);
    } finally {
      recargar();
    }
  }
  return (
    <>
      <h2>Números de la rifa</h2>
      {err && <p role="alert">{err}</p>}
      <Campo titulo="Filtrar números">
        <select
          value={filtro}
          onChange={(e) => {
            filtrar(e.target.value);
            paginar(0);
          }}
        >
          {["todos", "disponible", "reservado", "vendido"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Campo>
      <div className="numeros">
        {visibles.slice(pagina * 100, pagina * 100 + 100).map((n) => (
          <button
            key={n.numero}
            data-estado={n.estado}
            aria-label={"Número " + n.numero + ", " + n.estado}
            aria-pressed={sel.includes(n.id_numero_rifa)}
            disabled={!abiertos || n.estado !== "disponible"}
            onClick={() =>
              elegir((ids) =>
                ids.includes(n.id_numero_rifa)
                  ? ids.filter((i) => i !== n.id_numero_rifa)
                  : [...ids, n.id_numero_rifa],
              )
            }
          >
            {numero(n.numero)}
          </button>
        ))}
      </div>
      {visibles.length > 100 && (
        <div className="acciones">
          <button disabled={!pagina} onClick={() => paginar((p) => p - 1)}>
            Anterior
          </button>
          <span>
            {pagina + 1} / {Math.ceil(visibles.length / 100)}
          </span>
          <button
            disabled={(pagina + 1) * 100 >= visibles.length}
            onClick={() => paginar((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
      {abiertos && (
        <section>
          <h3>Asignar números</h3>
          <p>
            {sel.length} seleccionados · {soles(r.precio_numero * sel.length)}
          </p>
          {sel.length > 0 && (
            <SeleccionPersona
              personas={ps}
              seleccion={comprador}
              elegir={(p) => {
                seleccionar(p);
                if (p && !ps.some((x) => x.id_persona === p.id_persona))
                  personas([...ps, p]);
              }}
            />
          )}
          {sel.length > 0 && comprador && (
            <Formulario
              accion={modo === "venta" ? "Registrar venta" : "Reservar"}
              guardar={async (f) => {
                if (!sel.length) throw Error("Selecciona al menos un número.");
                const args = {
                  p_rifa: r.id_rifa,
                  p_persona: comprador.id_persona,
                  p_numeros: sel,
                };
                await ejecutar(
                  modo === "venta" ? "registrar_venta" : "reservar_numeros",
                  modo === "venta"
                    ? args
                    : {
                        ...args,
                        p_vencimiento: new Date(
                          Date.now() + Number(f.get("minutos")) * 60000,
                        ).toISOString(),
                      },
                );
                elegir([]);
                seleccionar(null);
              }}
            >
              <Campo titulo="Operación">
                <select
                  value={modo}
                  onChange={(e) => modoVenta(e.target.value)}
                >
                  <option value="venta">Venta</option>
                  <option value="reserva">Reserva</option>
                </select>
              </Campo>
              {modo === "reserva" && (
                <Campo titulo="Vencimiento en minutos">
                  <input
                    name="minutos"
                    type="number"
                    min="1"
                    defaultValue="60"
                    required
                  />
                </Campo>
              )}
            </Formulario>
          )}
        </section>
      )}
      <h2>Reservas activas</h2>
      {!rs.some((b) => b.estado === "activa") && <p>Sin reservas activas.</p>}
      {rs
        .filter((b) => b.estado === "activa")
        .map((b) => {
          const numeros = ds
            .filter((d) => d.id_reserva === b.id_reserva)
            .map((d) => String(d.id_numero_rifa));
          return (
            <section key={String(b.id_reserva)}>
              <h3>{nombreDe(b.id_persona)}</h3>
              <p>
                {ns
                  .filter((n) => numeros.includes(n.id_numero_rifa))
                  .map((n) => numero(n.numero))
                  .join(", ")}{" "}
                · Vence {fecha(String(b.fecha_vencimiento))}
              </p>
              <div className="acciones">
                <Accion
                  texto="Convertir en venta"
                  ejecutar={() =>
                    ejecutar("registrar_venta", {
                      p_rifa: r.id_rifa,
                      p_persona: b.id_persona,
                      p_numeros: numeros,
                      p_reserva: b.id_reserva,
                    })
                  }
                />
                <Accion
                  texto="Liberar"
                  ejecutar={() =>
                    ejecutar("liberar_reserva", { p_reserva: b.id_reserva })
                  }
                />
              </div>
            </section>
          );
        })}
      <h2>Ventas y pagos</h2>
      {!vs.length && <p>Aún no hay ventas.</p>}
      {vs.map((v) => {
        const movimientos = pagos.filter((p) => p.id_venta === v.id_venta);
        const cobrado =
          movimientos.reduce(
            (s, p) => s + Math.round(Number(p.importe) * 100),
            0,
          ) / 100;
        const pendiente = pend.find((p) => p.id_venta === v.id_venta);
        const saldo = pendiente ? Number(pendiente.saldo) : null;
        return (
          <details key={String(v.id_venta)}>
            <summary>
              {nombreDe(v.id_persona)} ·{" "}
              {v.estado === "pendiente" && saldo !== null
                ? (cobrado > 0 ? "Pago parcial" : "Sin pagos") +
                  " · Saldo " +
                  soles(saldo)
                : v.estado + " · " + soles(Number(v.total))}
            </summary>
            <p>{fecha(String(v.fecha_venta))}</p>
            <p>
              Total de la venta: {soles(Number(v.total))} · Cobrado:{" "}
              {soles(cobrado)}
              {v.estado !== "cancelada" && saldo !== null && (
                <> · Por cobrar: {soles(saldo)}</>
              )}
            </p>
            {movimientos.map((p) => (
              <p key={String(p.id_pago)}>
                Pago manual · {p.medio_pago} · {soles(Number(p.importe))}
              </p>
            ))}
            {abiertos &&
              v.estado === "pendiente" &&
              saldo !== null &&
              saldo > 0 && (
                <Formulario
                  accion="Registrar pago o abono"
                  guardar={(f) =>
                    ejecutar("confirmar_pago", {
                      p_venta: v.id_venta,
                      p_importe: Number(f.get("importe")),
                      p_medio: campo(f, "medio"),
                      p_referencia: campo(f, "ref") || null,
                    })
                  }
                >
                  <Campo titulo="Importe recibido (S/)">
                    <input
                      name="importe"
                      type="number"
                      min=".01"
                      step=".01"
                      key={saldo}
                      max={saldo}
                      defaultValue={saldo}
                      required
                    />
                  </Campo>
                  <Campo titulo="Medio">
                    <select name="medio">
                      {["yape", "plin", "efectivo", "otro"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo titulo="Referencia">
                    <input name="ref" />
                  </Campo>
                </Formulario>
              )}
            {abiertos && v.estado !== "cancelada" && (
              <Formulario
                accion="Cancelar venta"
                guardar={async (f) => {
                  if (!confirm("¿Anular boletos y liberar estos números?"))
                    throw Error("Venta conservada.");
                  await ejecutar("cancelar_venta", {
                    p_venta: v.id_venta,
                    p_motivo: campo(f, "motivo"),
                  });
                }}
              >
                <Campo titulo="Motivo de cancelación">
                  <input name="motivo" required />
                </Campo>
              </Formulario>
            )}
            {dev
              .filter((d) =>
                pagos.some(
                  (p) => p.id_pago === d.id_pago && p.id_venta === v.id_venta,
                ),
              )
              .map((d) => (
                <div key={String(d.id_devolucion)}>
                  <p>
                    Devolución {d.estado} · {soles(Number(d.importe))}
                  </p>
                  {d.estado === "pendiente" && (
                    <Accion
                      texto="Marcar dinero devuelto"
                      ejecutar={() =>
                        ejecutar("confirmar_devolucion", {
                          p_devolucion: d.id_devolucion,
                        })
                      }
                    />
                  )}
                </div>
              ))}
          </details>
        );
      })}
    </>
  );
}
