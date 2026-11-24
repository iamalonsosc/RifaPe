import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import {
  Ticket as Icono,
  LayoutDashboard,
  Users,
  Layers,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { db, filas, soles, fecha, type Rifa, type Fila } from "./datos";
import { Formulario, Campo } from "./controles";
import { EditarRifa, PanelRifa, Participantes } from "./gestion";
import { Publico } from "./boletos";
import "./estilo.css";

function Inicio() {
  const [sesion, setSesion] = useState<string | null | undefined>(undefined),
    [perfilCargado, setPerfilCargado] = useState<string | null>(null),
    [error, setError] = useState("");
  const [tema, setTema] = useState(localStorage.getItem("tema") || "claro"),
    [seccion, ir] = useState("Resumen"),
    [activa, abrir] = useState(""),
    [nuevo, crear] = useState(false);
  const [rifas, setRifas] = useState<Rifa[]>([]),
    [resumen, setResumen] = useState<Fila[]>([]),
    [idEstadisticas, filtrarResumen] = useState(""),
    [estados, ponerEstados] = useState<Fila[]>([]),
    [version, actualizar] = useState(0);
  const rifaEstadisticas = rifas.find((r) => r.id_rifa === idEstadisticas);
  const [ahora, reloj] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => reloj(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const grupo = (r: Rifa) =>
    r.estado !== "activa" ? 2 : Date.parse(r.fecha_sorteo) < ahora ? 1 : 0;
  const fechasEstado = new Map(estados.map((e) => [e.id_rifa, e]));
  const tiempo = (r: Rifa) =>
    Date.parse(
      String(
        fechasEstado.get(r.id_rifa)?.[
          {
            en_sorteo: "fecha_inicio",
            terminada: "fecha_fin",
            anulada: "fecha_anulacion",
          }[r.estado] ?? ""
        ] ?? r.fecha_sorteo,
      ),
    );
  const ordenadas = [...rifas].sort(
    (a, b) =>
      grupo(a) - grupo(b) ||
      (grupo(a) === 0 ? 1 : -1) * (tiempo(a) - tiempo(b)) ||
      a.nombre.localeCompare(b.nombre),
  );
  const cifras = rifaEstadisticas
    ? resumen.filter((s) => s.id_rifa === rifaEstadisticas.id_rifa)
    : resumen;
  const recargar = () => actualizar((v) => v + 1);
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem("tema", tema);
  }, [tema]);
  useEffect(() => {
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((_evento, s) => {
      setSesion(s?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let vigente = true;
    if (!sesion) {
      setPerfilCargado(null);
      return;
    }
    async function cargar() {
      try {
        const p = await filas("perfil", ["id_perfil", sesion!]);
        if (!p.length)
          throw Error("Esta cuenta no tiene el perfil de administradora.");
        const [r, s, e] = await Promise.all([
          filas<Rifa>("rifa", undefined, "id_rifa"),

          filas<Fila>("vw_resumen_rifa", undefined, "id_rifa"),
          filas<Fila>("vw_estados_rifa", undefined, "id_rifa"),
        ]);
        if (vigente) {
          setRifas(r);
          setResumen(s);
          ponerEstados(e);
          setPerfilCargado(sesion!);
          setError("");
        }
      } catch (e) {
        if (vigente) setError((e as Error).message);
      }
    }
    void cargar();
    return () => {
      vigente = false;
    };
  }, [sesion, version]);
  if (!db || !sesion || perfilCargado !== sesion)
    return (
      <main className="acceso">
        <div className="marca">
          <Icono /> RifaPes
        </div>
        <section>
          <p className="ceja">ADMINISTRACIÓN DE RIFAS</p>
          <h1>Iniciar sesión</h1>
          {!db ? (
            <p>
              Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. En
              Netlify, guarda ambas variables en la configuración del proyecto y
              vuelve a desplegar. Para pruebas locales, guárdalas en .env.local
              y reinicia la aplicación.
            </p>
          ) : sesion === undefined ? (
            <p>Cargando sesión…</p>
          ) : sesion ? (
            <>
              <p>{error || "Comprobando acceso…"}</p>
              <button onClick={() => db!.auth.signOut()}>Cerrar sesión</button>
            </>
          ) : (
            <Formulario
              accion="Ingresar"
              guardar={async (f) => {
                const { error } = await db!.auth.signInWithPassword({
                  email: String(f.get("correo")),
                  password: String(f.get("clave")),
                });
                if (error) throw Error(error.message);
              }}
            >
              <Campo titulo="Correo electrónico">
                <input
                  name="correo"
                  type="email"
                  autoComplete="username"
                  required
                />
              </Campo>
              <Campo titulo="Contraseña">
                <input
                  name="clave"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Campo>
            </Formulario>
          )}
        </section>
      </main>
    );
  const elegida = rifas.find((r) => r.id_rifa === activa);
  function navegar(s: string) {
    ir(s);
    abrir("");
    crear(false);
  }
  return (
    <div className="app">
      <aside>
        <div className="marca">
          <Icono /> RifaPes
        </div>
        <nav>
          {[
            [LayoutDashboard, "Resumen"],
            [Layers, "Rifas"],
            [Users, "Participantes"],
          ].map(([I, s]) => {
            const Comp = I as typeof Layers;
            return (
              <button
                key={String(s)}
                aria-current={seccion === s ? "page" : undefined}
                onClick={() => navegar(String(s))}
              >
                <Comp size={18} />
                {String(s)}
              </button>
            );
          })}
        </nav>
        <div className="pie">
          <button
            onClick={() => setTema(tema === "claro" ? "oscuro" : "claro")}
          >
            {tema === "claro" ? <Moon /> : <Sun />}Cambiar tema
          </button>
          <button onClick={() => db!.auth.signOut()}>
            <LogOut />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main>
        <header>
          <span>Administración</span>
          <span>© Industrias Sanchez</span>
        </header>
        {error && <p role="alert">{error}</p>}
        {elegida ? (
          <>
            <button onClick={() => abrir("")}>← Volver a rifas</button>
            <PanelRifa
              key={activa}
              rifa={elegida}
              version={version}
              recargar={recargar}
            />
          </>
        ) : seccion === "Participantes" ? (
          <Participantes version={version} recargar={recargar} />
        ) : nuevo ? (
          <>
            <button onClick={() => crear(false)}>← Volver</button>
            <h1>Nueva rifa</h1>
            <EditarRifa
              alGuardar={(id) => {
                recargar();
                crear(false);
                abrir(id);
              }}
            />
          </>
        ) : (
          <>
            <div className="titulo">
              <div>
                <p className="ceja">PANEL DE CONTROL</p>
                <h1>
                  {seccion === "Resumen" ? "Resumen general" : "Mis rifas"}
                </h1>
              </div>
              <button className="principal" onClick={() => crear(true)}>
                + Nueva rifa
              </button>
            </div>
            {seccion === "Resumen" && (
              <>
                <Campo titulo="Estadísticas de">
                  <select
                    value={rifaEstadisticas?.id_rifa ?? ""}
                    onChange={(e) => filtrarResumen(e.target.value)}
                  >
                    <option value="">
                      Todas las rifas (incluye terminadas)
                    </option>
                    {ordenadas.map((r) => (
                      <option key={r.id_rifa} value={r.id_rifa}>
                        {r.nombre} · {r.estado.replace("_", " ")}
                        {grupo(r) === 1 ? " · Fecha vencida" : ""} ·{" "}
                        {fecha(r.fecha_sorteo)}
                      </option>
                    ))}
                  </select>
                </Campo>
                <h2>
                  {rifaEstadisticas
                    ? "Resumen de " + rifaEstadisticas.nombre
                    : "Totales de todas las rifas"}
                </h2>
                <div className="metricas">
                  {[
                    [
                      rifaEstadisticas ? "Estado" : "Rifas activas",
                      rifaEstadisticas
                        ? rifaEstadisticas.estado.replace("_", " ")
                        : rifas.filter((r) => r.estado === "activa").length,
                    ],
                    [
                      "Recaudación neta",
                      soles(
                        cifras.reduce((n, r) => n + Number(r.recaudacion), 0),
                      ),
                    ],
                    ...["disponibles", "reservados", "vendidos"].map((k) => [
                      k,
                      cifras.reduce((n, r) => n + Number(r[k]), 0),
                    ]),
                  ].map(([k, v]) => (
                    <article key={k}>
                      <small>{k}</small>
                      <strong>{v}</strong>
                    </article>
                  ))}
                </div>
              </>
            )}
            <h2>Rifas registradas</h2>
            {!rifas.length && (
              <section>
                <Icono size={32} />
                <h3>Aún no tienes rifas</h3>
                <p>
                  Crea tu primera rifa para configurar los premios y asignar
                  números.
                </p>
              </section>
            )}
            {[
              ["activa", "Activas"],
              ["en_sorteo", "En sorteo"],
              ["terminada", "Terminadas"],
              ["anulada", "Anuladas"],
            ].map(([estado, titulo]) => {
              const lista = ordenadas.filter((r) => r.estado === estado);
              return (
                <details
                  key={estado}
                  className={"grupo-rifas " + estado}
                  open={estado === "activa" || estado === "en_sorteo"}
                >
                  <summary>
                    {titulo} ({lista.length})
                  </summary>
                  {!lista.length && <p>Sin rifas en esta sección.</p>}
                  <div className="tarjetas">
                    {lista.map((r) => {
                      const n = Number(
                        resumen.find((s) => s.id_rifa === r.id_rifa)
                          ?.vendidos || 0,
                      );
                      return (
                        <button
                          key={r.id_rifa}
                          className="tarjeta"
                          onClick={() => {
                            ir("Rifas");
                            abrir(r.id_rifa);
                          }}
                        >
                          <small>
                            {r.estado.replace("_", " ")}
                            {grupo(r) === 1 ? " · Fecha vencida" : ""}
                          </small>
                          <h3>{r.nombre}</h3>
                          {r.estado === "anulada" && (
                            <p>
                              {fechasEstado.get(r.id_rifa)?.motivo} · Por
                              devolver{" "}
                              {soles(
                                Number(
                                  fechasEstado.get(r.id_rifa)?.por_devolver ??
                                    0,
                                ),
                              )}{" "}
                              · Devuelto{" "}
                              {soles(
                                Number(
                                  fechasEstado.get(r.id_rifa)?.devuelto ?? 0,
                                ),
                              )}
                            </p>
                          )}
                          <p>{fecha(r.fecha_sorteo)}</p>
                          <progress value={n} max={r.cantidad_numeros} />
                          <span>
                            {n} de {r.cantidad_numeros} vendidos
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
const ruta = location.pathname.match(/^\/(boleto|rifa)\/([^/]+)\/?$/);
createRoot(document.getElementById("root")!).render(
  ruta ? <Publico token={ruta[2]} esRifa={ruta[1] === "rifa"} /> : <Inicio />,
);
