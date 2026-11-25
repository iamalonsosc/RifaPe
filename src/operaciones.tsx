import {
  ResumenCompra,
  CancelarNumeros,
  type Oferta,
  type Cotizacion,
} from "./ofertas";
import { ResumenPagos, FormularioAbono } from "./pagos";
import { Ayuda } from "./ayuda";
import { useEffect, useState } from "react";
import { Campo, Formulario, Accion } from "./controles";
import {
  campo,
  filas,
  rpc,
  nombre,
  numero,
  soles,
  resumenBoletos,
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
  const [ajustes, ponerAjustes] = useState<Fila[]>([]);
  const [boletos, emisiones] = useState<Fila[]>([]),
    [lineas, cargarLineas] = useState<Fila[]>([]);
  const [comprador, seleccionar] = useState<Persona | null>(null);
  const [sel, elegir] = useState<string[]>([]),
    [filtro, filtrar] = useState("todos"),
    [pagina, paginar] = useState(0),
    [modo, modoVenta] = useState("venta"),
    [err, error] = useState("");
  useEffect(() => {
    if (r.estado !== "activa") modoVenta("venta");
  }, [r.estado]);
  useEffect(() => {
    let vivo = true;
    const f: [string, string] = ["id_rifa", r.id_rifa];
    Promise.all([
      filas<Numero>("numero_rifa", f, "numero"),
      filas<Persona>("persona", undefined, "id_persona"),
      filas<Fila>("venta", f, "id_venta"),
      filas<Fila>("vw_historial_reservas", f, "id_reserva"),
      filas<Fila>("detalle_reserva", undefined, "id_detalle_reserva"),
      filas<Fila>("vw_pagos_pendientes", f, "id_venta"),
      filas<Fila>("devolucion", undefined, "id_devolucion"),
      filas<Fila>("vw_pagos_historicos", undefined, "id_pago"),
      filas<Fila>("vw_boletos_rifa", f, "id_boleto"),
      filas<Fila>("vw_detalle_ventas", f, "id_detalle_venta"),
      filas<Fila>("vw_anulaciones_parciales", f, "id_ajuste"),
    ])
      .then(
        ([n, p, v, b, d, s, h, c, tickets, detallesVenta, ajustesVenta]) => {
          if (vivo) {
            poner(n);
            personas(p);
            ventas(v);
            reservas(b);
            detalles(d);
            saldos(s);
            devoluciones(h);
            cobros(c);
            emisiones(tickets);
            cargarLineas(detallesVenta);
            ponerAjustes(ajustesVenta);
            error("");
          }
        },
      )
      .catch((e) => error(e.message));
    return () => {
      vivo = false;
    };
  }, [r.id_rifa, version]);
  const [ofertas, ponerOfertas] = useState<Oferta[]>([]),
    [precio, precioVenta] = useState<{ clave: string; valor: Cotizacion }>();
  const clavePrecio = [r.id_rifa, version, sel.length].join(":");
  useEffect(() => {
    let vivo = true;
    filas<Oferta>("oferta_rifa", ["id_rifa", r.id_rifa], "cantidad")
      .then((os) => {
        if (vivo) ponerOfertas(os.filter((o) => o.activa));
      })
      .catch((e) => {
        if (vivo) error(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [r.id_rifa, version]);
  useEffect(() => {
    let vivo = true;
    if (sel.length)
      rpc<Cotizacion>("cotizar_compra", {
        p_rifa: r.id_rifa,
        p_cantidad: sel.length,
      })
        .then((v) => {
          if (vivo) precioVenta({ clave: clavePrecio, valor: v });
        })
        .catch((e) => {
          if (vivo) error(e.message);
        });
    return () => {
      vivo = false;
    };
  }, [clavePrecio, sel.length, r.id_rifa]);
  const cotizacion = precio?.clave === clavePrecio ? precio.valor : undefined;
  const [vence, ponerVence] = useState(false);
  const [pestana, verPestana] = useState("Todas");
  const abiertos =
      r.estado === "activa" || (r.estado === "en_sorteo" && r.ventas_abiertas),
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
  const operaciones = [
    ...vs.map((v) => ({
      fila: v,
      tipo:
        v.estado === "cancelada"
          ? v.estado_antes_anulacion === "pagada" ||
            (!v.estado_antes_anulacion &&
              pagos.some((p) => p.id_venta === v.id_venta))
            ? "Anulados"
            : "Cancelados"
          : "Ventas",
      fecha: String(v.fecha_cancelacion || v.fecha_venta),
    })),
    ...ajustes.map((fila) => ({
      fila,
      tipo: "Anulados",
      fecha: String(fila.fecha),
    })),
    ...rs.map((b) => ({
      fila: b,
      tipo: ["liberada", "vencida"].includes(String(b.estado))
        ? "Cancelados"
        : "Reservas",
      fecha: String(b.fecha_cambio || b.fecha_creacion),
    })),
  ].sort(
    (a, b) =>
      Date.parse(b.fecha) - Date.parse(a.fecha) ||
      String(a.fila.id_venta || a.fila.id_reserva).localeCompare(
        String(b.fila.id_venta || b.fila.id_reserva),
      ),
  );
  const filtradas = operaciones.filter(
    (o) => pestana === "Todas" || o.tipo === pestana,
  );
  return (
    <>
      <h2>Números de la rifa</h2>
      {err && <p role="alert">{err}</p>}
      {r.estado === "en_sorteo" && (
        <p>
          {abiertos
            ? "Ventas abiertas durante el sorteo"
            : "Ventas cerradas durante el sorteo"}
        </p>
      )}
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
          <ResumenCompra
            base={
              r.estado === "en_sorteo"
                ? (r.precio_en_vivo ?? r.precio_numero)
                : r.precio_numero
            }
            cantidad={sel.length}
            seleccion={ns
              .filter((n) => sel.includes(n.id_numero_rifa))
              .map((n) => n.numero)}
            ofertas={r.estado === "en_sorteo" ? [] : ofertas}
            cotizacion={cotizacion}
          />
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
              deshabilitado={modo === "venta" && !cotizacion}
              accion={modo === "venta" ? "Registrar venta" : "Reservar"}
              guardar={async (f) => {
                if (!sel.length) throw Error("Selecciona al menos un número.");
                const args = {
                  p_rifa: r.id_rifa,
                  p_persona: comprador.id_persona,
                  p_numeros: sel,
                };
                if (
                  modo === "reserva" &&
                  vence &&
                  Date.parse(
                    String(f.get("dia")) +
                      "T" +
                      String(f.get("hora")) +
                      ":00-05:00",
                  ) <= Date.now()
                )
                  throw Error("Indica una fecha y hora futuras de Perú.");
                await ejecutar(
                  modo === "venta"
                    ? "registrar_venta_cotizada"
                    : "reservar_numeros",
                  modo === "venta"
                    ? { ...args, p_total: cotizacion?.total }
                    : {
                        ...args,
                        p_vencimiento: vence
                          ? new Date(
                              String(f.get("dia")) +
                                "T" +
                                String(f.get("hora")) +
                                ":00-05:00",
                            ).toISOString()
                          : null,
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
                  {r.estado === "activa" && (
                    <option value="reserva">Reserva</option>
                  )}
                </select>
              </Campo>
              {modo === "reserva" && (
                <>
                  <label className="interruptor">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={vence}
                      onChange={(e) => ponerVence(e.target.checked)}
                    />{" "}
                    ¿La reserva tiene vencimiento?
                  </label>
                  <Campo titulo="Fecha de vencimiento (Perú)">
                    <input
                      type="date"
                      name="dia"
                      required={vence}
                      disabled={!vence}
                    />
                  </Campo>
                  <Campo titulo="Hora de vencimiento (Perú)">
                    <input
                      type="time"
                      name="hora"
                      required={vence}
                      disabled={!vence}
                    />
                  </Campo>
                  {!vence && (
                    <p>
                      Esta reserva no tiene fecha de vencimiento. Los números
                      permanecerán reservados hasta que confirmes o canceles la
                      operación.
                    </p>
                  )}
                </>
              )}
            </Formulario>
          )}
        </section>
      )}
      <h2>Historial de operaciones</h2>
      <nav className="filtros-operaciones" aria-label="Operaciones">
        {["Todas", "Ventas", "Reservas", "Cancelados", "Anulados"].map((t) => (
          <button
            key={t}
            aria-pressed={pestana === t}
            onClick={() => verPestana(t)}
          >
            {t} ·{" "}
            {t === "Todas"
              ? operaciones.length
              : operaciones.filter((o) => o.tipo === t).length}
          </button>
        ))}
      </nav>
      {!filtradas.length && <p>Sin operaciones en esta sección.</p>}
      {filtradas.map(({ fila: v, tipo }) => {
        if (v.id_ajuste)
          return (
            <details key={String(v.id_ajuste)}>
              <summary>
                {nombreDe(v.id_persona)} · Anulación parcial ·{" "}
                {fecha(String(v.fecha))}
              </summary>
              <p>
                {v.motivo} · {soles(Number(v.total_anterior))} →{" "}
                {soles(Number(v.total_nuevo))}
              </p>
              <p>
                Venta {v.id_venta} · {fecha(String(v.fecha_venta))} ·
                Responsable {v.id_perfil}
              </p>
              {Array.isArray(v.numeros_retirados) && (
                <p>
                  Números anulados: {v.numeros_retirados.map(numero).join(", ")}
                </p>
              )}
            </details>
          );
        if (v.id_reserva) {
          const b = v;
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
                ·{" "}
                {b.fecha_vencimiento
                  ? "Vence " + fecha(String(b.fecha_vencimiento))
                  : "Sin vencimiento"}
              </p>
              <p>
                {fecha(String(b.fecha_creacion))} ·{" "}
                {b.estado === "activa"
                  ? "Reservado"
                  : b.estado === "liberada"
                    ? "Cancelado"
                    : b.estado === "vencida"
                      ? "Cancelado por vencimiento"
                      : "Convertida en venta"}{" "}
                {b.fecha_cambio && fecha(String(b.fecha_cambio))}
              </p>
              {b.estado === "activa" && (
                <>
                  <p>
                    Reservado ·{" "}
                    <span className="financiero">Pendiente de pago</span> ·
                    Saldo {soles(Number(b.saldo))}
                    {b.tarifa_heredada && " · Reserva anterior a la actualización. Verifica el importe con el participante: se conservó el precio base y la promoción disponible al actualizar."}
                  </p>
                  <p>
                    {boletos.some(
                      (t) =>
                        t.id_reserva === b.id_reserva && t.estado === "emitido",
                    )
                      ? "Emitido"
                      : "Pendiente de emisión"}{" "}
                    <Ayuda tema="Emitir" />
                  </p>
                  <div className="acciones">
                    {!boletos.some((t) => t.id_reserva === b.id_reserva) && (
                      <Accion
                        texto="Emitir boleto"
                        ejecutar={() =>
                          ejecutar("emitir_boletos_reserva", {
                            p_reserva: b.id_reserva,
                          })
                        }
                      />
                    )}
                    <Accion
                      deshabilitado={!abiertos}
                      texto="Convertir en venta"
                      ejecutar={async () => {
                        const c = await rpc<Cotizacion>("cotizar_reserva", {
                          p_reserva: b.id_reserva,
                        });
                        if (
                          !confirm(
                            (b.tarifa_heredada ? "Reserva histórica: confirma que el importe coincide con lo acordado. " : "") + "¿Convertir la reserva por " + soles(c.total) + "?",
                          )
                        )
                          throw Error("Reserva conservada.");
                        await ejecutar("registrar_venta_cotizada", {
                          p_total: c.total,
                          p_rifa: r.id_rifa,
                          p_persona: b.id_persona,
                          p_numeros: numeros,
                          p_reserva: b.id_reserva,
                        });
                      }}
                    />
                    <Accion
                      texto="Liberar"
                      ejecutar={async () => {
                        if (
                          !confirm("¿Liberar los números y anular sus boletos?")
                        )
                          throw Error("Reserva conservada.");
                        await ejecutar("liberar_reserva", {
                          p_reserva: b.id_reserva,
                        });
                      }}
                    />
                  </div>
                </>
              )}
            </section>
          );
        }
        const movimientos = pagos
          .filter((p) => p.id_venta === v.id_venta)
          .sort(
            (a, b) =>
              String(a.fecha_pago).localeCompare(String(b.fecha_pago)) ||
              String(a.id_pago).localeCompare(String(b.id_pago)),
          );

        const numerosVenta = lineas
          .filter((l) => l.id_venta === v.id_venta)
          .map(
            (l) =>
              "N.º " +
              numero(Number(l.numero)) +
              (l.estado_detalle === "cancelado" ? " (anulado)" : ""),
          );
        const estadoBoleto = resumenBoletos(
          lineas.filter((l) => l.id_venta === v.id_venta),
          boletos.filter((t) => t.id_venta === v.id_venta),
        );
        const identidad = [
          numerosVenta.join(", "),
          nombreDe(v.id_persona),
          estadoBoleto.includes("anulado") ? estadoBoleto : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const emitidos = boletos.filter((t) => t.id_venta === v.id_venta);
        const devVenta = dev.filter((d) =>
          movimientos.some((p) => p.id_pago === d.id_pago),
        );
        const bruto =
          movimientos.reduce(
            (s, p) => s + Math.round(Number(p.importe) * 100),
            0,
          ) / 100;
        const cobrado =
          v.estado === "cancelada"
            ? bruto
            : bruto - devVenta.reduce((a, d) => a + Number(d.importe), 0);
        const pendiente = pend.find((p) => p.id_venta === v.id_venta);
        const saldo = pendiente ? Number(pendiente.saldo) : null;
        return (
          <details
            key={String(v.id_venta)}
            onToggle={(e) => {
              if (!e.currentTarget.open)
                e.currentTarget
                  .querySelector<HTMLButtonElement>('button[type="reset"]')
                  ?.click();
            }}
          >
            <summary data-operacion={tipo}>
              {nombreDe(v.id_persona)} ·{" "}
              {v.estado === "pendiente" && saldo !== null
                ? (cobrado > 0 ? "Pago parcial" : "Sin pagos") +
                  " · Saldo " +
                  soles(saldo)
                : (v.estado === "cancelada"
                    ? tipo === "Anulados"
                      ? "Anulado"
                      : "Cancelado"
                    : v.estado === "pagada"
                      ? "Vendido"
                      : v.estado) +
                  " · " +
                  soles(Number(v.total))}
              <small>
                {" "}
                · {numerosVenta.length} números ·{" "}
                {fecha(String(v.fecha_cancelacion || v.fecha_venta))}
              </small>
            </summary>
            <p>
              {fecha(String(v.fecha_venta))}
              {v.durante_sorteo && " · Venta en vivo"}
            </p>
            {v.fecha_cancelacion && (
              <p>
                Importe original{" "}
                {soles(
                  Number(
                    lineas.find((l) => l.id_venta === v.id_venta)
                      ?.total_original ?? v.total,
                  ),
                )}{" "}
                · {tipo} · {fecha(String(v.fecha_cancelacion))} ·{" "}
                {v.motivo_anulacion} · Responsable {v.responsable_anulacion} ·
                Operación {v.id_venta} · Boletos{" "}
                {emitidos.map((b) => b.id_boleto).join(", ")}
              </p>
            )}
            <ResumenPagos
              total={Number(v.total)}
              cobrado={cobrado}
              anulada={tipo === "Anulados"}
              cancelada={v.estado === "cancelada"}
              identidad={identidad}
              cantidad={numerosVenta.length}
              movimientos={movimientos}
            />
            <p>
              {v.estado === "cancelada"
                ? "Asignación cancelada"
                : "Número asignado"}{" "}
              ·{" "}
              {estadoBoleto}{" "}
              <Ayuda tema="Emitir" />
            </p>

            {!emitidos.length && v.estado !== "cancelada" && (
              <Accion
                texto="Emitir boleto"
                ejecutar={() =>
                  ejecutar("emitir_boletos", { p_venta: v.id_venta })
                }
              />
            )}

            {abiertos &&
              v.estado === "pendiente" &&
              saldo !== null &&
              saldo > 0 && (
                <FormularioAbono
                  identidad={identidad}
                  total={Number(v.total)}
                  key={saldo}
                  saldo={saldo}
                  guardar={(importe, medio, ref) =>
                    ejecutar("confirmar_pago", {
                      p_venta: v.id_venta,
                      p_importe: importe,
                      p_medio: medio,
                      p_referencia: ref || null,
                    })
                  }
                />
              )}
            {r.estado === "activa" && v.estado !== "cancelada" && (
              <CancelarNumeros
                venta={String(v.id_venta)}
                lineas={lineas.filter(
                  (l) =>
                    l.id_venta === v.id_venta &&
                    l.estado_detalle !== "cancelado",
                )}
                recargar={recargar}
              />
            )}
            {r.estado === "activa" && v.estado !== "cancelada" && (
              <Formulario
                accion="Cancelar venta"
                ayuda="Cancelar"
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
