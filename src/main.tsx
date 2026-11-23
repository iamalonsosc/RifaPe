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
    [autorizada, setAutorizada] = useState(false),
    [error, setError] = useState("");
  const [tema, setTema] = useState(localStorage.getItem("tema") || "claro"),
    [seccion, ir] = useState("Resumen"),
    [activa, abrir] = useState(""),
    [nuevo, crear] = useState(false);
  const [rifas, setRifas] = useState<Rifa[]>([]),
    [resumen, setResumen] = useState<Fila[]>([]),
    [idEstadisticas, filtrarResumen] = useState(""),
    [version, actualizar] = useState(0);
  const rifaEstadisticas = rifas.find((r) => r.id_rifa === idEstadisticas);
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
      setAutorizada(false);
      return;
    }
    async function cargar() {
      try {
        const p = await filas("perfil", ["id_perfil", sesion!]);
        if (!p.length)
          throw Error("Esta cuenta no tiene el perfil de administradora.");
        const [r, s] = await Promise.all([
          filas<Rifa>("rifa", undefined, "id_rifa"),
          filas<Fila>("vw_resumen_rifa", undefined, "id_rifa"),
        ]);
        if (vigente) {
          setRifas(r);
          setResumen(s);
          setAutorizada(true);
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
  if (!db || !sesion || !autorizada)
    return (
      <main className="acceso">
        <div className="marca">
          <Icono /> RifaFácil
        </div>
        <section>
          <p className="ceja">ADMINISTRACIÓN DE RIFAS</p>
          <h1>Iniciar sesión</h1>
          {!db ? (
            <p>
              Configura la URL y la clave pública de Supabase en el archivo
              .env.local para habilitar el acceso.
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
          <Icono /> RifaFácil
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
          <span>Hora de Perú · PEN</span>
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
                    {rifas.map((r) => (
                      <option key={r.id_rifa} value={r.id_rifa}>
                        {r.nombre} · {r.estado.replace("_", " ")} ·{" "}
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
            <div className="tarjetas">
              {rifas.map((r) => {
                const n = Number(
                  resumen.find((s) => s.id_rifa === r.id_rifa)?.vendidos || 0,
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
                    <small>{r.estado.replace("_", " ")}</small>
                    <h3>{r.nombre}</h3>
                    <p>{fecha(r.fecha_sorteo)}</p>
                    <progress value={n} max={r.cantidad_numeros} />
                    <span>
                      {n} de {r.cantidad_numeros} vendidos
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
const ruta = location.pathname.match(/^\/boleto\/([^/]+)\/?$/);
createRoot(document.getElementById("root")!).render(
  ruta ? <Publico token={ruta[1]} /> : <Inicio />,
);
