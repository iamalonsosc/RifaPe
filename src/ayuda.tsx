import { useId, useState, useRef, useEffect, useLayoutEffect } from "react";

import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
const explicaciones = {
  "Número ganador":
    "Elige en qué selección gana el premio. Si eliges 3, los dos primeros números salen sin premio. Para sortear puestos, registra los premios en orden de tercero a primero y elige 1 en cada uno.",
  Prioridad:
    "La prioridad 1 aparece primero. El boleto muestra tantos premios como quepan con las fotos y el QR configurados.",
  Método: "Selecciona el medio por el que recibiste el pago.",
  Referencia:
    "Puedes indicar un número de operación, comprobante u observación.",
  Sorpresa:
    "Muestra un regalo misterioso hasta revelar el premio durante el sorteo.",
  Abonar:
    "Registra el importe recibido. Cada abono conserva su fecha, medio y referencia hasta completar el total.",
  Reservar:
    "Separa los números sin vencimiento o hasta la fecha y hora que elijas. Convierte la reserva en venta para registrar un abono.",
  Emitir:
    "Genera un boleto por número. Conserva su QR aunque se abone después. Para participar en el sorteo la venta debe estar pagada.",
  Cancelar:
    "Al liberar la reserva o cancelar la venta se anulan sus boletos y se liberan sus números. Los pagos anteriores conservan su historial.",
  "Sacar número":
    "El servidor elige entre los números habilitados para este premio y guarda la selección antes de mostrarla.",
};
export type TemaAyuda = keyof typeof explicaciones;
export function Ayuda({ tema }: { tema: keyof typeof explicaciones }) {
  const id = useId(),
    [abierta, abrir] = useState(false);
  const boton = useRef<HTMLButtonElement>(null),
    globo = useRef<HTMLSpanElement>(null);
  const tiempo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tactil = useRef(false);
  function parar() {
    clearTimeout(tiempo.current);
  }
  function cerrar() {
    parar();
    abrir(false);
  }
  useEffect(() => () => clearTimeout(tiempo.current), []);
  useLayoutEffect(() => {
    if (!abierta) return;
    function colocar() {
      const rect = boton.current!.getBoundingClientRect(),
        el = globo.current!;
      el.style.left =
        Math.max(
          8,
          Math.min(
            innerWidth - el.offsetWidth - 8,
            rect.left + rect.width / 2 - el.offsetWidth / 2,
          ),
        ) + "px";
      el.style.top =
        (rect.top > el.offsetHeight + 10
          ? rect.top - el.offsetHeight - 6
          : Math.min(innerHeight - el.offsetHeight - 8, rect.bottom + 6)) +
        "px";
    }
    function fuera(e: PointerEvent) {
      if (
        !boton.current?.contains(e.target as Node) &&
        !globo.current?.contains(e.target as Node)
      )
        cerrar();
    }
    colocar();
    window.addEventListener("scroll", colocar, true);
    window.addEventListener("resize", colocar);
    document.addEventListener("pointerdown", fuera);
    return () => {
      window.removeEventListener("scroll", colocar, true);
      window.removeEventListener("resize", colocar);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierta]);
  return (
    <>
      <button
        ref={boton}
        className="icono-ayuda"
        type="button"
        aria-label={"Ayuda sobre " + tema}
        aria-expanded={abierta}
        aria-describedby={abierta ? id : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") {
            parar();
            tiempo.current = setTimeout(() => abrir(true), 180);
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") {
            parar();
            tiempo.current = setTimeout(cerrar, 180);
          }
        }}
        onPointerDown={(e) => {
          tactil.current = e.pointerType === "touch";
        }}
        onFocus={() => {
          if (!tactil.current) abrir(true);
        }}
        onBlur={cerrar}
        onClick={(e) => {
          e.preventDefault();
          parar();
          abrir(tactil.current ? !abierta : true);
          tactil.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cerrar();
        }}
      >
        <CircleHelp size={16} />
      </button>
      {abierta &&
        createPortal(
          <span
            className="globo-ayuda"
            ref={globo}
            id={id}
            role="tooltip"
            onPointerEnter={parar}
            onPointerLeave={cerrar}
          >
            {explicaciones[tema]}
          </span>,
          document.fullscreenElement ?? document.body,
        )}
    </>
  );
}
