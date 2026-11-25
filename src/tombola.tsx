import { useLayoutEffect, useRef } from "react";
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
export function Tombola({
  muestra,
  mezcla,
  salida,
  alPintar,
}: {
  alPintar?: (cantidad: number) => void;
  muestra: number[];
  mezcla: boolean;
  salida?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const anteriores = useRef(new Set<number>());
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) {
      alPintar?.(0);
      return;
    }
    const radio = Math.min(55, 320 / Math.sqrt(Math.max(1, muestra.length)));
    const limite = 390 - radio;
    const reducida = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bolas = muestra.map((n, i) => {
      // Espiral de ángulo áureo: cada número tiene una posición inicial dentro del cristal.
      const angulo = i * Math.PI * (3 - Math.sqrt(5)),
        distancia = limite * Math.sqrt((i + 0.5) / muestra.length);
      return {
        etiqueta: numero(n),
        x: distancia * Math.cos(angulo),
        y: distancia * Math.sin(angulo),
        vx: 170 * Math.cos(angulo * 0.7),
        vy: 170 * Math.sin(angulo * 0.7),
        nueva: anteriores.current.size > 0 && !anteriores.current.has(n),
      };
    });
    anteriores.current = new Set(muestra);
    const principio = performance.now();
    let frame = 0,
      anterior = principio;
    function pintar(ms: number) {
      const t = reducida ? 1 : (ms - principio) / 1000,
        dt = Math.min(0.032, (ms - anterior) / 1000);
      anterior = ms;
      ctx!.clearRect(0, 0, 800, 800);
      for (const [i, b] of bolas.entries()) {
        if (mezcla && !reducida) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          const d = Math.hypot(b.x, b.y);
          if (d > limite) {
            const nx = b.x / d,
              ny = b.y / d,
              impulso = 2 * Math.max(0, b.vx * nx + b.vy * ny);
            b.x = nx * limite;
            b.y = ny * limite;
            b.vx -= impulso * nx;
            b.vy -= impulso * ny;
          }
        }
        const x = 400 + b.x,
          y = 400 + (b.nueva && t < 0.5 ? b.y * t * 2 : b.y);
        ctx!.fillStyle = colores[i % colores.length];
        ctx!.beginPath();
        ctx!.arc(x, y, radio, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = "#fff";
        ctx!.font = "bold " + Math.floor(radio * 0.8) + "px sans-serif";
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText(b.etiqueta, x, y, radio * 1.8);
      }
      if (!reducida && (mezcla || (t < 0.5 && bolas.some((b) => b.nueva))))
        frame = requestAnimationFrame(pintar);
    }
    pintar(principio);
    alPintar?.(bolas.length);
    return () => cancelAnimationFrame(frame);
  }, [muestra, mezcla, alPintar]);
  return (
    <div className="maquina">
      <div className="cristal">
        <canvas
          aria-label={muestra.length + " pelotas en la esfera"}
          ref={canvas}
          width="800"
          height="800"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <div className="pedestal" />
      {salida !== undefined && (
        <span className="salida-oficial">{numero(salida)}</span>
      )}
    </div>
  );
}
