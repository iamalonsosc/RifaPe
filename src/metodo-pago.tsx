import { useEffect, useRef, useState, type ReactNode } from "react";
import { Wallet } from "lucide-react";
import { Campo } from "./controles";
import type { MetodoPago, Rifa, TipoMetodoPago } from "./datos";
import { copiarTexto } from "./whatsapp";

export function metodoDe(r?: Rifa): MetodoPago | null {
  if (!r?.tipo_metodo_pago || !r.referencia_pago) return null;
  return {
    tipo: r.tipo_metodo_pago,
    nombre: r.nombre_metodo_pago || r.tipo_metodo_pago,
    referencia: r.referencia_pago,
  };
}
export function mensajeMetodo(m?: MetodoPago | null) {
  return (
    m &&
    [
      "💳 *MÉTODO DE PAGO*",
      (m.tipo === "Otros" ? "Método: " : "Aplicativo: ") + m.nombre,
      (m.tipo === "Otros" ? "Referencia: " : "Número: ") + m.referencia,
    ].join("\n")
  );
}
export function validarMetodo(m: MetodoPago | null) {
  if (!m) return null;
  const nombre =
    m.tipo === "Otros" ? m.nombre.trim().replace(/\s+/g, " ") : m.tipo;
  const referencia = m.referencia.trim().replace(/\s+/g, " ");
  if (m.tipo !== "Otros" && !/^9[0-9]{8}$/.test(referencia))
    throw Error(
      "El celular debe comenzar con 9 y tener nueve dígitos, sin espacios ni símbolos.",
    );
  if (!nombre || !referencia)
    throw Error("Escribe el nombre del método y la referencia de pago.");
  return { tipo: m.tipo, nombre, referencia };
}
function Logo({ tipo }: { tipo: TipoMetodoPago }) {
  return tipo === "Otros" ? (
    <Wallet aria-hidden="true" className="logo-pago" />
  ) : (
    <img
      className="logo-pago"
      src={tipo === "Yape" ? "/yape.png" : "/plin.png"}
      alt=""
    />
  );
}
export function TarjetaPago({
  metodo,
  franja = false,
  compacto = false,
  copiar = false,
  children,
}: {
  metodo?: MetodoPago | null;
  franja?: boolean;
  compacto?: boolean;
  copiar?: boolean;
  children?: ReactNode;
}) {
  const [aviso, avisar] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!metodo) return null;

  const referenciaFormateada =
    metodo.tipo !== "Otros"
      ? metodo.referencia.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")
      : metodo.referencia;

  if (compacto) {
    return (
      <div
        className={
          "pago-compacto-inline pago-compacto-" + metodo.tipo.toLowerCase()
        }
      >
        <Logo tipo={metodo.tipo} />
        <span className="texto-pago-compacto">
          {metodo.tipo === "Otros" ? metodo.nombre : "Paga al"}
        </span>
        <strong className="numero-pago-compacto">{referenciaFormateada}</strong>
      </div>
    );
  }

  return (
    <div
      className={
        "tarjeta-pago pago-" +
        metodo.tipo.toLowerCase() +
        (franja ? " franja-pago" : "")
      }
    >
      <div className="titulo-pago">Método de pago</div>
      <div className="identidad-pago">
        <Logo tipo={metodo.tipo} />
        <b>{metodo.nombre}</b>
      </div>
      <strong className="referencia-pago">{metodo.referencia}</strong>
      {children}
      {copiar && (
        <button
          type="button"
          onClick={async () => {
            try {
              await copiarTexto(metodo.referencia);
              avisar("Número de pago copiado correctamente");
            } catch {
              avisar(
                "No se pudo copiar. Puedes seleccionar y copiar el número.",
              );
            }
            clearTimeout(timer.current);
            timer.current = setTimeout(() => avisar(""), 3000);
          }}
        >
          Copiar número de pago
        </button>
      )}
      {aviso && <span role="status">{aviso}</span>}
    </div>
  );
}
export function EditorMetodo({
  metodo,
  cambiar,
  conMovimientos,
}: {
  metodo: MetodoPago | null;
  cambiar: (m: MetodoPago | null) => void;
  conMovimientos: boolean;
}) {
  return (
    <fieldset className="editor-pago">
      <legend>Método de pago</legend>
      <label className="interruptor">
        <input
          type="checkbox"
          role="switch"
          checked={!!metodo}
          onChange={(e) =>
            cambiar(
              e.target.checked
                ? { tipo: "Yape", nombre: "Yape", referencia: "" }
                : null,
            )
          }
        />
        Habilitar método de pago
      </label>
      {metodo && (
        <>
          <div className="opciones-pago">
            {(["Yape", "Plin", "Otros"] as const).map((tipo) => (
              <label
                className={"opcion-pago pago-" + tipo.toLowerCase()}
                key={tipo}
              >
                <Logo tipo={tipo} />
                {tipo}
                <input
                  type="radio"
                  name="tipo_pago"
                  checked={metodo.tipo === tipo}
                  onChange={() =>
                    cambiar({
                      tipo,
                      nombre: tipo === "Otros" ? "" : tipo,
                      referencia:
                        tipo === "Otros" || metodo.tipo === "Otros"
                          ? ""
                          : metodo.referencia,
                    })
                  }
                />
              </label>
            ))}
          </div>
          {metodo.tipo === "Otros" && (
            <Campo titulo="Nombre del método">
              <input
                value={metodo.nombre}
                maxLength={64}
                onChange={(e) => cambiar({ ...metodo, nombre: e.target.value })}
              />
            </Campo>
          )}
          <Campo
            titulo={
              metodo.tipo === "Otros"
                ? "Referencia de pago"
                : "Número de celular peruano"
            }
          >
            <input
              inputMode={metodo.tipo === "Otros" ? "text" : "tel"}
              maxLength={100}
              value={metodo.referencia}
              onChange={(e) =>
                cambiar({ ...metodo, referencia: e.target.value })
              }
            />
          </Campo>
          {metodo.referencia.trim() && (
            <>
              <small>Vista previa</small>
              <TarjetaPago metodo={metodo} />
            </>
          )}
        </>
      )}
      {conMovimientos && (
        <p>
          Al cambiar el método, los enlaces de ventas y reservas mostrarán los
          nuevos datos. Regenera las imágenes y los mensajes que necesites
          volver a compartir.
        </p>
      )}
    </fieldset>
  );
}
