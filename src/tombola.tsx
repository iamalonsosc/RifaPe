import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { numero } from "./datos";

const colores = [
  "#ec5264",
  "#4b86ec",
  "#b051e1",
  "#e99c18",
  "#25a880",
  "#e467ab",
  "#098bc0",
  "#ea8040",
];
// Coordenadas relativas al diámetro del cristal. La simulación solo presenta números.
export function Tombola({
  muestra,
  mezcla,
  salida,
}: {
  muestra: number[];
  mezcla: boolean;
  salida?: number;
}) {
  const salidaRef = useRef<HTMLSpanElement>(null);
  const esfera = useRef<HTMLDivElement>(null);
  const numeros = muestra.slice(0, 12);
  if (salida !== undefined && !numeros.includes(salida))
    numeros.splice(11, 1, salida);
  const clave = numeros.join(",");
  useLayoutEffect(() => {
    const elementos = Array.from(esfera.current!.children) as HTMLElement[];
    const bolas = elementos.map((el, i) => ({
      el,
      x: 30 + (i % 4) * 14,
      y: 57 - Math.floor(i / 4) * 13,
      vx: Math.cos(i * 2.4) * 35,
      vy: -34 - i * 2,
    }));
    const radio = 7.5,
      limite = 49 - radio;
    let frame = 0,
      anterior = 0,
      inicio = 0;
    function paso(t: number, dt: number, aire: boolean) {
      for (const [i, b] of bolas.entries()) {
        b.vx += (aire ? Math.sin(t * 3 + i * 2) * 110 : 0) * dt;
        b.vy += (aire ? Math.sin(t * 5 + i) * 85 - 25 : 130) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      for (let vuelta = 0; vuelta < 3; vuelta++) {
        for (const [i, b] of bolas.entries()) {
          for (const c of bolas.slice(i + 1)) {
            const dx = c.x - b.x,
              dy = c.y - b.y,
              d = Math.hypot(dx, dy) || 0.01;
            if (d >= 2 * radio) continue;
            const nx = dx / d,
              ny = dy / d,
              separar = (2 * radio - d) / 2;
            b.x -= nx * separar;
            b.y -= ny * separar;
            c.x += nx * separar;
            c.y += ny * separar;
            const impulso =
              ((b.vx - c.vx) * nx + (b.vy - c.vy) * ny) * (aire ? 0.95 : 0.55);
            if (impulso > 0) {
              b.vx -= impulso * nx;
              b.vy -= impulso * ny;
              c.vx += impulso * nx;
              c.vy += impulso * ny;
            }
          }
        }
        for (const b of bolas) {
          const dx = b.x - 50,
            dy = b.y - 50,
            d = Math.hypot(dx, dy);
          if (d > limite) {
            const nx = dx / d,
              ny = dy / d;
            b.x = 50 + nx * limite;
            b.y = 50 + ny * limite;
            const golpe =
              Math.max(0, b.vx * nx + b.vy * ny) * (aire ? 1.94 : 1.12);
            b.vx -= golpe * nx;
            b.vy -= golpe * ny;
          }
        }
      }
    }
    function pintar(t: number) {
      for (const [i, b] of bolas.entries()) {
        b.el.style.left = b.x + "%";
        b.el.style.top = b.y + "%";
        b.el.style.transform =
          "translate(-50%,-50%) rotate(" +
          (mezcla ? Math.sin(t * 3 + i) * 28 : 0) +
          "deg)";
      }
    }
    for (let i = 0; i < 170; i++) paso(0, 1 / 60, false);
    pintar(0);
    if (mezcla && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bolas.forEach((b, i) => {
        b.vy = -80 - i * 4;
        b.vx = 45 * Math.cos(i * 2.2);
      });
      function mover(ms: number) {
        if (!inicio) inicio = ms;
        const t = (ms - inicio) / 1000,
          dt = Math.min(0.035, (ms - (anterior || ms)) / 1000);
        anterior = ms;
        paso(t, dt / 2, true);
        paso(t, dt / 2, true);
        pintar(t);
        frame = requestAnimationFrame(mover);
      }
      frame = requestAnimationFrame(mover);
    }
    return () => cancelAnimationFrame(frame);
  }, [clave, mezcla]);
  useLayoutEffect(() => {
    const bola = esfera.current?.querySelector<HTMLElement>(".extraida"),
      destino = salidaRef.current;
    if (
      !bola ||
      !destino ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const a = bola.getBoundingClientRect(),
      b = destino.getBoundingClientRect();
    destino.style.setProperty("--tono", bola.style.getPropertyValue("--tono"));
    const x = a.left + a.width / 2 - b.left - b.width / 2,
      y = a.top + a.height / 2 - b.top - b.height / 2;
    const animacion = destino.animate(
      [
        {
          transform:
            "translate(" +
            x +
            "px," +
            y +
            "px) scale(" +
            a.width / b.width +
            ")",
        },
        { transform: "none" },
      ],
      { duration: 650, easing: "cubic-bezier(.25,.65,.35,1)" },
    );
    return () => animacion.cancel();
  }, [salida]);
  return (
    <div className="maquina" aria-hidden="true">
      <div className="cristal" ref={esfera}>
        {numeros.map((n, i) => (
          <span
            className={"bola-color " + (salida === n ? "extraida" : "")}
            key={n}
            style={{ "--tono": colores[i % colores.length] } as CSSProperties}
          >
            {numero(n)}
          </span>
        ))}
      </div>
      <div className="pedestal" />
      {salida !== undefined && (
        <span ref={salidaRef} className="salida-oficial">
          {numero(salida)}
        </span>
      )}
    </div>
  );
}
