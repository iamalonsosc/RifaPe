import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomInt } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";

test("Migraciones y reglas con dos conexiones PostgreSQL", async (t) => {
  const pg = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), "rifapes-")),
    port: randomInt(20000, 45000),
    password: randomUUID(),
    persistent: false,
    autoRehydrateSymlinks: true,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  const db = pg.getPgClient(),
    otra = pg.getPgClient();
  try {
    await db.connect();
    await otra.connect();
    const q = async (sql, args = []) => (await db.query(sql, args)).rows;
    const uno = async (sql, args = []) =>
      Object.values((await q(sql, args))[0])[0];
    await q(await readFile("pruebas/servicios-locales.sql", "utf8"));
    const admin = randomUUID();
    for (const file of (await readdir("supabase/migrations")).sort()) {
      if (file === "20261123001100_dos_administradoras.sql")
        await q(
          "insert into auth.users values($1,'admin@example.invalid','{\"rol_rifafacil\":\"administradora\"}')",
          [admin],
        );
      const migracion = await readFile(
        join("supabase/migrations", file),
        "utf8",
      );
      if (file.startsWith("20261124000100")) {
        await t.test(
          "Actualización desde la versión 12 con boleto pagado y QR anterior",
          async () => {
            await q("begin");
            try {
              await q("set local role authenticated");
              await q("select set_config('request.jwt.claim.sub',$1,true)", [
                admin,
              ]);
              const r = await uno(
                "select guardar_rifa('Anterior',10,4,now(),'numero')",
              );
              const p = await uno(
                "select guardar_persona('Participante anterior')",
              );
              const v = await uno(
                "select registrar_venta($1,$2,array(select id_numero_rifa from numero_rifa where id_rifa=$1 order by numero limit 2))",
                [r, p],
              );
              await q("select confirmar_pago($1,20,'yape')", [v]);
              const anterior = await uno(
                "select token_publico from vw_boletos_rifa where id_venta=$1 limit 1",
                [v],
              );
              await q("reset role");
              await q(
                migracion.replace(/^begin;/i, "").replace(/commit;\s*$/i, ""),
              );
              await q("set local role service_role");
              const ticket = await uno("select consultar_boleto($1)", [
                anterior,
              ]);
              assert.equal(ticket.codigo, anterior);
              assert.deepEqual(ticket.numeros, [1, 2]);
              assert.equal(ticket.telefono, undefined);
              assert.deepEqual(
                (
                  await uno("select consultar_boleto($1)", [
                    ticket.codigo_grupo,
                  ])
                ).numeros,
                [1, 2],
              );
            } finally {
              await q("rollback");
            }
          },
        );
      }
      if (file.startsWith("20261124000400")) {
        await t.test(
          "Actualización 15 a 16 con reservas, ingresos y sorteos históricos",
          async () => {
            await q("begin");
            try {
              await q("set local role authenticated");
              await q("select set_config('request.jwt.claim.sub',$1,true)", [
                admin,
              ]);
              const persona = await uno(
                "select guardar_persona('Cliente histórico')",
              );
              const crear = () =>
                uno("select guardar_rifa('Histórica',10,12,now(),'numero')");
              const r = await crear();
              const numeros = async (id) =>
                (
                  await q(
                    "select id_numero_rifa id from numero_rifa where id_rifa=$1 order by numero",
                    [id],
                  )
                ).map((n) => n.id);
              const ns = await numeros(r);
              const vender = (id, lista) =>
                uno("select registrar_venta($1,$2,$3)", [id, persona, lista]);
              const pagar = (v, m) =>
                q("select confirmar_pago($1,$2,'efectivo')", [v, m]);
              const promocion = (precio) =>
                q(
                  "select guardar_rifa_ofertas('Histórica',10,12,now(),'numero',null,null,$1,$2)",
                  [r, JSON.stringify([{ cantidad: 3, precio, activa: true }])],
                );
              await promocion(25);
              const reserva = await uno(
                "select reservar_numeros($1,$2,$3,now()+interval '3 days')",
                [r, persona, ns.slice(0, 3)],
              );
              await q("select emitir_boletos_reserva($1)", [reserva]);
              await promocion(27);
              const cotizar = () =>
                uno("select cotizar_reserva($1)", [reserva]);
              const anterior = await cotizar();
              assert.equal(anterior.total, 27);
              const parcial = await vender(r, ns.slice(3, 5));
              await pagar(parcial, 20);
              const retirar = await uno(
                "select id_detalle_venta from detalle_venta where id_venta=$1 order by id_detalle_venta limit 1",
                [parcial],
              );
              await q(
                "select ajustar_numeros_venta($1,array[$2::uuid],true,'Retiro histórico',10,20)",
                [parcial, retirar],
              );
              const total = await vender(r, [ns[5]]);
              await pagar(total, 10);
              await q("select cancelar_venta($1,'Baja histórica')", [total]);
              for (const terminar of [true, false]) {
                const id = await crear();
                const v = await vender(id, (await numeros(id)).slice(0, 2));
                await pagar(v, 20);
                await q("select guardar_premio($1,'Principal',1,1,false)", [
                  id,
                ]);
                const premio = await uno(
                  "select id_premio_rifa from premio_rifa where id_rifa=$1",
                  [id],
                );
                if (!terminar)
                  await q("select guardar_premio($1,'Segundo',2,1,false)", [
                    id,
                  ]);
                await q("select iniciar_sorteo($1)", [id]);
                await q("select extraer_numero_sorteo($1,$2,1,$3)", [
                  id,
                  premio,
                  randomUUID(),
                ]);
                if (terminar) await q("select finalizar_sorteo($1)", [id]);
              }
              const historial = async () =>
                Promise.all([
                  q(
                    "select id_reserva,estado,precio_unitario,fecha_vencimiento from reserva order by id_reserva",
                  ),
                  q(
                    "select id_venta,estado,total from venta order by id_venta",
                  ),
                  q("select * from pago order by id_pago"),
                  q("select * from devolucion order by id_devolucion"),
                  q("select id_rifa,estado from rifa order by id_rifa"),
                  q(
                    "select * from vw_historial_ganadores order by id_rifa,orden_sorteo",
                  ),
                  q(
                    "select id_venta,cobro_vigente(id_venta) from venta order by id_venta",
                  ),
                ]);
              const previo = await historial();
              const recaudacion = () =>
                uno(
                  "select recaudacion from vw_resumen_rifa where id_rifa=$1",
                  [r],
                );
              assert.equal(Number(await recaudacion()), 30);
              const tokens = (
                await q(
                  "select token_publico token from vw_boletos_rifa union select token_grupo from vw_comprobantes order by token",
                )
              ).map((b) => b.token);
              async function comprobarEnlaces() {
                await q("set local role service_role");
                const datos = [];
                for (const token of tokens) {
                  const b = await uno("select consultar_boleto($1)", [token]);
                  datos.push([b.estado, b.codigo, b.numeros]);
                }
                await q("set local role authenticated");
                return datos;
              }
              const enlaces = await comprobarEnlaces();
              await q("reset role");
              await q(
                migracion.replace(/^begin;/i, "").replace(/commit;\s*$/i, ""),
              );
              await q("set local role authenticated");
              assert.deepEqual(await historial(), previo);
              assert.equal(Number(await recaudacion()), 10);
              assert.deepEqual(await comprobarEnlaces(), enlaces);
              assert.deepEqual(await cotizar(), anterior);
              await promocion(28);
              assert.equal((await cotizar()).total, 27);
              assert.equal(
                Number(
                  await uno(
                    "select saldo from vw_historial_reservas where id_reserva=$1",
                    [reserva],
                  ),
                ),
                27,
              );
              assert.equal(
                await uno(
                  "select tarifa_heredada from reserva where id_reserva=$1",
                  [reserva],
                ),
                true,
              );
              assert.equal(
                (
                  await uno(
                    "select numeros_retirados from vw_anulaciones_parciales where id_venta=$1",
                    [parcial],
                  )
                ).length,
                1,
              );
              assert.equal(
                await uno(
                  "select estado_antes_anulacion from venta where id_venta=$1",
                  [total],
                ),
                "pagada",
              );
              const nueva = await uno(
                "select reservar_numeros($1,$2,$3,null)",
                [r, persona, ns.slice(6, 9)],
              );
              await promocion(25);
              assert.equal(
                Number(
                  await uno(
                    "select saldo from vw_historial_reservas where id_reserva=$1",
                    [nueva],
                  ),
                ),
                28,
              );
              await q("select registrar_venta_cotizada($1,$2,$3,28,$4)", [
                r,
                persona,
                ns.slice(6, 9),
                nueva,
              ]);
            } finally {
              await q("rollback");
            }
          },
        );
      }
      await q(migracion);
    }
    assert.equal(
      await uno("select plaza from perfil where id_perfil=$1", [admin]),
      1,
    );
    for (const c of [db, otra]) {
      await c.query("set role authenticated");
      await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
        admin,
      ]);
    }
    const persona = await uno("select guardar_persona('Alonso')");
    const crear = (regla) =>
      uno("select guardar_rifa('Noviembre',10,50,now(),$1)", [regla]);
    const r = await crear("numero");
    await t.test("Mapa presencial opcional y cambio de modalidad", async () => {
      const mapa = "https://maps.app.goo.gl/ejemplo";
      const guardar =
        "select guardar_transmision($1,'presencial',null,null,'Lima',$2)";
      await q(guardar, [r, mapa]);
      const leer = () =>
        uno(
          "select enlace_mapa from configuracion_transmision where id_rifa=$1",
          [r],
        );
      assert.equal(await leer(), mapa);
      await assert.rejects(
        q(guardar, [r, "https://maps.app.goo.gl.ejemplo.com/a"]),
        /Google Maps/,
      );
      assert.equal(await leer(), mapa);
      await q(
        "select guardar_transmision($1,'meet',null,'https://meet.google.com/abc',null)",
        [r],
      );
      assert.equal(await leer(), null);
      await q(guardar, [r, null]);
    });
    const nums = await q(
      "select id_numero_rifa id,numero from numero_rifa where id_rifa=$1 order by numero",
      [r],
    );
    const vender = (ids, rifa = r, quien = persona) =>
      uno("select registrar_venta($1,$2,$3)", [rifa, quien, ids]);
    const pago = (v, m) => q("select confirmar_pago($1,$2,'yape')", [v, m]);
    let v;
    await t.test(
      "Venta simultánea, participante reutilizado y pagos parciales",
      async () => {
        const args = [r, persona, [nums[6].id, nums[8].id]];
        const results = await Promise.allSettled(
          [db, otra].map((c) =>
            c.query("select registrar_venta($1,$2,$3) id", args),
          ),
        );
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        v = results.find((x) => x.status === "fulfilled").value.rows[0].id;
        await vender([nums[24].id]);
        assert.equal(
          await uno(
            "select count(*) from vw_numeros_por_persona where id_persona=$1",
            [persona],
          ),
          "3",
        );
        await pago(v, 10);
        assert.equal(
          await uno("select saldo from vw_pagos_pendientes where id_venta=$1", [
            v,
          ]),
          "10.00",
        );
        await assert.rejects(pago(v, 11));
        assert.equal(await uno("select count(*) from boleto"), "0");
        await q("select emitir_boletos($1)", [v]);
        await pago(v, 10);
        await q("select emitir_boletos($1)", [v]);
        assert.equal(await uno("select count(*) from boleto"), "2");
      },
    );
    await t.test(
      "Token público, cancelación, liberación y devolución",
      async () => {
        const token = await uno("select token_publico from boleto limit 1");
        await q("reset role");
        await q("set role service_role");
        const datos = await uno("select consultar_boleto($1)", [token]);
        assert.equal(datos.participante, "Alonso");
        assert.equal(datos.telefono, undefined);
        await q("reset role");
        await q("set role authenticated");
        await q("select cancelar_venta($1,'Solicitud')", [v]);
        assert.equal(
          await uno("select count(*) from boleto where estado='anulado'"),
          "2",
        );
        assert.equal(await uno("select sum(importe) from devolucion"), "20.00");
        await vender([nums[6].id]);
      },
    );
    await t.test("Reserva exclusiva y conversión", async () => {
      const args = [r, persona, [nums[10].id]];
      const res = await uno(
        "select reservar_numeros($1,$2,$3,now()+interval '1 hour')",
        args,
      );
      await assert.rejects(vender(args[2]));
      await q("select emitir_boletos_reserva($1)", [res]);
      const token = await uno(
        "select token_publico from vw_boletos_rifa where id_reserva=$1",
        [res],
      );
      const venta = await uno("select registrar_venta($1,$2,$3,$4)", [
        ...args,
        res,
      ]);
      await q("select emitir_boletos($1)", [venta]);
      assert.deepEqual(
        await q("select token_publico from vw_boletos_rifa where id_venta=$1", [
          venta,
        ]),
        [{ token_publico: token }],
      );
    });
    await t.test(
      "25 premios, descartes, reconexión tras 16 y reintento",
      async () => {
        const venta = await vender(nums.slice(25).map((n) => n.id));
        await pago(venta, 250);
        for (let i = 1; i <= 25; i++)
          await q("select guardar_premio($1,$2,$3,$4,false)", [
            r,
            "Premio " + i,
            i,
            i === 1 ? 3 : 1,
          ]);
        await q("select iniciar_sorteo($1)", [r]);
        await assert.rejects(vender([nums[0].id]));
        const premios = await q(
          "select * from premio_rifa where id_rifa=$1 order by orden_sorteo",
          [r],
        );
        for (const [i, p] of premios.entries()) {
          const c = i >= 16 ? otra : db;
          for (let j = 1; j <= p.numero_extraccion_ganadora; j++) {
            const args = [r, p.id_premio_rifa, j, randomUUID()];
            const sql = "select * from extraer_numero_sorteo($1,$2,$3,$4)";
            const e = (await c.query(sql, args)).rows[0];
            assert.equal(e.es_ganadora, j === p.numero_extraccion_ganadora);
            assert.equal(
              (await c.query(sql, args)).rows[0].id_extraccion,
              e.id_extraccion,
            );
          }
        }
        await q("select finalizar_sorteo($1)", [r]);
        assert.equal(
          await uno(
            "select count(distinct numero) from vw_historial_ganadores where id_rifa=$1",
            [r],
          ),
          "25",
        );
      },
    );
    await t.test("Reglas por persona y repetición independientes", async () => {
      for (const regla of ["persona", "repeticion"]) {
        const id = await crear(regla);
        const ns = await q(
          "select id_numero_rifa id from numero_rifa where id_rifa=$1 order by numero limit 3",
          [id],
        );
        await pago(await vender([ns[0].id, ns[1].id], id), 20);
        for (let i = 1; i <= 2; i++)
          await q("select guardar_premio($1,'Premio',$2,1,false)", [id, i]);
        if (regla === "persona") {
          await assert.rejects(
            q("select iniciar_sorteo($1)", [id]),
            /solo se garantizan/,
          );
          await pago(
            await vender(
              [ns[2].id],
              id,
              await uno("select guardar_persona('Sol')"),
            ),
            10,
          );
        }
        await q("select iniciar_sorteo($1)", [id]);
        for (const p of await q(
          "select id_premio_rifa id from premio_rifa where id_rifa=$1 order by orden_sorteo",
          [id],
        ))
          await q("select extraer_numero_sorteo($1,$2,1,$3)", [
            id,
            p.id,
            randomUUID(),
          ]);
        if (regla === "persona")
          assert.equal(
            await uno(
              "select count(distinct id_persona) from vw_historial_ganadores where id_rifa=$1",
              [id],
            ),
            "2",
          );
      }
    });
    await t.test(
      "Reserva de 50, emisión, abonos de 10 y 20 y cancelación del saldo",
      async () => {
        const rifa = await uno(
          "select guardar_rifa('Abonos',50,2,now(),'numero')",
        );
        const n = await uno(
          "select id_numero_rifa from numero_rifa where id_rifa=$1 limit 1",
          [rifa],
        );
        const reserva = await uno(
          "select reservar_numeros($1,$2,$3,now()+interval '1 hour')",
          [rifa, persona, [n]],
        );
        await q("select emitir_boletos_reserva($1)", [reserva]);
        const token = await uno(
          "select token_publico from vw_boletos_rifa where id_reserva=$1",
          [reserva],
        );
        await q("reset role");
        assert.equal(
          (await uno("select consultar_boleto($1)", [token])).estado,
          "emitido",
        );
        await q("set role authenticated");
        await q(
          "select guardar_rifa('Abonos',60,2,now(),'numero',null,null,$1)",
          [rifa],
        );
        const v = await uno("select registrar_venta($1,$2,$3,$4)", [
          rifa,
          persona,
          [n],
          reserva,
        ]);
        await assert.rejects(pago(v, 0));
        await assert.rejects(pago(v, -1));
        for (const [importe, saldo] of [
          [10, 40],
          [20, 20],
          [20, 0],
        ]) {
          await pago(v, importe);
          assert.equal(
            Number(
              await uno(
                "select v.total-sum(p.importe) from venta v join pago p using(id_venta) where id_venta=$1 group by v.total",
                [v],
              ),
            ),
            saldo,
          );
          await q("select emitir_boletos($1)", [v]);
          assert.deepEqual(
            await q(
              "select token_publico from vw_boletos_rifa where id_venta=$1",
              [v],
            ),
            [{ token_publico: token }],
          );
          if (saldo) await assert.rejects(pago(v, saldo + 1));
        }
        assert.equal(
          await uno(
            "select count(*) from pago where id_venta=$1 and id_perfil_registro=$2",
            [v, admin],
          ),
          "3",
        );
      },
    );
    await t.test(
      "Mil números habilitados y tres puestos oficiales",
      async () => {
        const id = await uno(
          "select guardar_rifa('Puestos',1,1000,now(),'numero')",
        );
        await q(
          "select confirmar_pago(registrar_venta($1, guardar_persona('Participante '||numero),array[id_numero_rifa]),1,'efectivo') from numero_rifa where id_rifa=$1",
          [id],
        );
        await q("select agregar_puestos($1,'Libro','Radio','Bicicleta')", [id]);
        await q("select iniciar_sorteo($1)", [id]);
        const premios = await q(
          "select * from premio_rifa where id_rifa=$1 order by orden_sorteo",
          [id],
        );
        assert.deepEqual(
          premios.map((p) => p.nombre),
          [
            "Tercer puesto · Libro",
            "Segundo puesto · Radio",
            "Primer puesto · Bicicleta",
          ],
        );
        for (const [i, p] of premios.entries()) {
          const resumen = await uno("select resumen_candidatos($1,$2)", [
            id,
            p.id_premio_rifa,
          ]);
          assert.equal(resumen.numeros, 1000 - i);
          assert.equal(resumen.participantes, 1000 - i);
          assert.equal(resumen.muestra.length, 1000 - i);
          assert.equal(
            await uno("select ventas_abiertas from rifa where id_rifa=$1", [
              id,
            ]),
            false,
          );
          await assert.rejects(
            q("select registrar_venta($1,$2,array[]::uuid[])", [id, persona]),
            /Ventas cerradas/,
          );
          const args = [id, p.id_premio_rifa, 1, randomUUID()];
          assert.equal(
            (
              await q("select * from extraer_numero_sorteo($1,$2,$3,$4)", args)
            )[0].es_ganadora,
            true,
          );
          await assert.rejects(
            q("select * from extraer_numero_sorteo($1,$2,$3,$4)", [
              ...args.slice(0, 3),
              randomUUID(),
            ]),
          );
        }
      },
    );
    await t.test("Precios históricos y edición bloqueada", async () => {
      const id = await crear("numero");
      const n = await uno(
        "select id_numero_rifa from numero_rifa where id_rifa=$1 limit 1",
        [id],
      );
      const venta = await vender([n], id);
      await q(
        "select guardar_rifa('Otro título',25,60,now(),'numero',null,null,$1)",
        [id],
      );
      assert.equal(
        await uno(
          "select precio_unitario from detalle_venta where id_venta=$1",
          [venta],
        ),
        "10.00",
      );
      await assert.rejects(
        q("select eliminar_rifa_sin_movimientos($1)", [id]),
        /historial/,
      );
      await assert.rejects(
        q("select guardar_premio($1,'Tardío',26,1,false)", [r]),
        /inició/,
      );
      const borrar = await crear("numero");
      await q("select guardar_premio($1,'Premio',1,1,false)", [borrar]);
      await q("select eliminar_rifa_sin_movimientos($1)", [borrar]);
      assert.equal(
        await uno("select count(*) from rifa where id_rifa=$1", [borrar]),
        "0",
      );
    });
    await t.test("Reservas vencidas y límite público", async () => {
      const id = await crear("numero");
      const n = await uno(
        "select id_numero_rifa from numero_rifa where id_rifa=$1 limit 1",
        [id],
      );
      const res = await uno(
        "select reservar_numeros($1,$2,$3,now()+interval '1 hour')",
        [id, persona, [n]],
      );
      await q("select emitir_boletos_reserva($1)", [res]);
      await q("reset role");
      await q(
        "update reserva set fecha_vencimiento=now()-interval '1 second' where id_reserva=$1",
        [res],
      );
      assert.equal(
        await uno("select estado from vw_boletos_rifa where id_reserva=$1", [
          res,
        ]),
        "anulado",
      );
      await q("select vencer_reservas()");
      assert.equal(
        await uno(
          "select b.estado from boleto b join detalle_reserva using(id_detalle_reserva) where id_reserva=$1",
          [res],
        ),
        "anulado",
      );
      assert.equal(
        await uno("select estado from numero_rifa where id_numero_rifa=$1", [
          n,
        ]),
        "disponible",
      );
      await q("set role service_role");
      for (let i = 1; i <= 61; i++)
        assert.equal(await uno("select permitir_consulta('origen')"), i <= 60);
      await q("reset role");
      await q("set role authenticated");
    });
    await t.test(
      "Boleto vigente, prioridades sin tope, intercambio y conservación de identidad",
      async () => {
        const rifa = await crear("numero");
        const numero = await uno(
          "select id_numero_rifa from numero_rifa where id_rifa=$1 and numero=7",
          [rifa],
        );
        const venta = await vender([numero], rifa);
        await pago(venta, 10);
        const token = await uno(
          "select token_publico from boleto join detalle_venta using(id_detalle_venta) where id_venta=$1",
          [venta],
        );
        const guardar = (i, prioridad, id = null) =>
          q(
            "select guardar_premio_con_prioridad($1,$2,$3,1,$4,'https://example.invalid/producto.png',null,$5,$6)",
            [rifa, "Premio " + i, i, i === 2, id, prioridad],
          );
        for (let i = 1; i <= 25; i++) await guardar(i, i <= 5 ? i : null);
        const ids = await q(
          "select * from vw_premios_rifa where id_rifa=$1 order by orden_sorteo",
          [rifa],
        );
        await assert.rejects(guardar(6, 1, ids[5].id_premio_rifa), /ocupada/);
        await guardar(6, 6, ids[5].id_premio_rifa);
        await guardar(2, 1, ids[1].id_premio_rifa);
        await q(
          "select guardar_rifa('Actualizada',10,50,'2030-02-10T15:00Z','numero',null,'https://example.invalid/foto.png',$1)",
          [rifa],
        );
        await q("reset role");
        await q("set role service_role");
        const b = await uno("select consultar_boleto($1)", [token]);
        assert.equal(b.codigo, token);
        assert.equal(b.numero, 7);
        assert.equal(b.participante, "Alonso");
        assert.equal(b.imagen, "https://example.invalid/foto.png");
        assert.equal(Date.parse(b.fecha), Date.parse("2030-02-10T15:00Z"));
        assert.equal(b.telefono, undefined);
        assert.deepEqual(b.destacados, [
          "Premio sorpresa",
          "Premio 1",
          "Premio 3",
          "Premio 4",
          "Premio 5",
          "Premio 6",
        ]);
        assert.equal(b.mas_premios, true);
        assert.equal(b.fotos_destacadas[0], null);
        assert.equal(
          b.fotos_destacadas[1],
          "https://example.invalid/producto.png",
        );
        await q("reset role");
        await q("set role authenticated");
        await q(
          "select guardar_plantilla_con_fotos($1,'Prueba','verano',true,false,true,null,false)",
          [rifa],
        );
        await q("reset role");
        await q("set role service_role");
        const sinFotos = await uno("select consultar_boleto($1)", [token]);
        assert.equal(sinFotos.fotos_destacadas, null);
        assert.deepEqual(sinFotos.destacados, b.destacados);
        await q("reset role");
        await q("set role authenticated");
        await q("select eliminar_premio($1,$2)", [rifa, ids[4].id_premio_rifa]);
        await guardar(6, 5, ids[5].id_premio_rifa);
      },
    );
    await t.test(
      "Dos administradoras aisladas en el mismo proyecto",
      async () => {
        const segunda = randomUUID();
        await q("reset role");
        await q(
          "insert into auth.users values($1,'segunda@example.invalid','{}')",
          [segunda],
        );
        await q(
          'update auth.users set raw_app_meta_data=\'{"rol_rifapes":"administradora"}\' where id=$1',
          [segunda],
        );
        await q(
          "update auth.users set raw_app_meta_data=raw_app_meta_data where id=$1",
          [segunda],
        );
        await assert.rejects(
          q(
            "insert into auth.users values($1,'tercera@example.invalid','{\"rol_rifapes\":\"administradora\"}')",
            [randomUUID()],
          ),
          /dos administradoras/,
        );
        await q("set role authenticated");
        await q("select set_config('request.jwt.claim.sub',$1,false)", [
          segunda,
        ]);
        for (const tabla of [
          "rifa",
          "persona",
          "venta",
          "boleto",
          "pago",
          "auditoria",
          "vw_resumen_rifa",
        ])
          assert.equal(await uno("select count(*) from " + tabla), "0");
        const propia = await crear("numero");
        await assert.rejects(
          q("select guardar_premio($1,'Ajeno',1,1,false)", [r]),
        );
        await assert.rejects(q("select eliminar_persona($1)", [persona]));
        assert.equal(
          await uno("select id_registro from auditoria where entidad='rifa'"),
          propia,
        );
        await q("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
        assert.equal(
          await uno("select count(*) from vw_resumen_rifa where id_rifa=$1", [
            propia,
          ]),
          "0",
        );
        assert.equal(
          await uno("select count(*) from auditoria where id_registro=$1", [
            propia,
          ]),
          "0",
        );
      },
    );
    await t.test(
      "Cotización óptima, compras independientes, redondeo y devoluciones",
      async () => {
        const crearOfertas = (id, lista) =>
          uno(
            "select guardar_rifa_ofertas('Promos',10,120,now(),'numero',null,null,$1,$2)",
            [id, JSON.stringify(lista)],
          );
        const tarifa = (cantidad, precio) => ({
          cantidad,
          precio,
          activa: true,
        });
        const id = await crearOfertas(null, [tarifa(3, 25)]);
        const cotizar = async (n) =>
          (await uno("select cotizar_compra($1,$2)", [id, n])).total;
        const importes = [];
        for (const n of [1, 3, 4, 6]) importes.push(await cotizar(n));
        assert.deepEqual(importes, [10, 25, 35, 50]);
        await assert.rejects(crearOfertas(id, [tarifa(3, 25), tarifa(3, 24)]));
        for (const mala of [
          tarifa(1, 4),
          tarifa(3, 31),
          tarifa(3, 0),
          tarifa(3, 24.999),
        ])
          await assert.rejects(crearOfertas(id, [mala]));
        const ns = (
          await q(
            "select id_numero_rifa from numero_rifa where id_rifa=$1 order by numero",
            [id],
          )
        ).map((n) => n.id_numero_rifa);
        const compra = (ids, total, quien = persona) =>
          uno("select registrar_venta_cotizada($1,$2,$3,$4)", [
            id,
            quien,
            ids,
            total,
          ]);
        await assert.rejects(compra(ns.slice(0, 3), 30));
        const v = await compra(ns.slice(0, 3), 25);
        assert.equal(
          await uno(
            "select sum(precio_unitario) from detalle_venta where id_venta=$1",
            [v],
          ),
          "25.00",
        );
        await pago(v, 15);
        assert.equal(
          await uno("select saldo from vw_pagos_pendientes where id_venta=$1", [
            v,
          ]),
          "10.00",
        );
        const token = await uno(
          "select token_grupo from vw_comprobantes where id_rifa=$1 and id_persona=$2",
          [id, persona],
        );
        const separado = await compra(ns.slice(3, 5), 20);
        await compra(ns.slice(5, 6), 10);
        assert.equal(
          await uno("select total from venta where id_venta=$1", [separado]),
          "20.00",
        );
        const otro = await uno("select guardar_persona('Alonso')");
        await compra(ns.slice(6, 7), 10, otro);
        assert.equal(
          await uno("select count(*) from vw_comprobantes where id_rifa=$1", [
            id,
          ]),
          "2",
        );
        assert.deepEqual(
          await uno(
            "select numeros from vw_comprobantes where token_grupo=$1",
            [token],
          ),
          [1, 2, 3, 4, 5, 6],
        );
        await crearOfertas(id, [tarifa(3, 20), tarifa(4, 24)]);
        assert.equal(await cotizar(6), 40); // Dos tríos ganan a un cuarteto más dos individuales.
        const detalles = (
          await q(
            "select id_detalle_venta from detalle_venta where id_venta=$1 order by id_numero_rifa",
            [v],
          )
        ).map((d) => d.id_detalle_venta);
        const ajustar = (
          ids,
          confirmar = false,
          total = null,
          cobrado = null,
        ) =>
          uno("select ajustar_numeros_venta($1,$2,$3,'Solicitud',$4,$5)", [
            v,
            ids,
            confirmar,
            total,
            cobrado,
          ]);
        let ajuste = await ajustar(detalles.slice(0, 1));
        assert.deepEqual(ajuste, {
          total: 20,
          cobrado: 15,
          saldo: 5,
          devolver: 0,
        });
        await assert.rejects(ajustar(detalles.slice(0, 1), true, 25, 15));
        await ajustar(detalles.slice(0, 1), true, 20, 15);
        await pago(v, 5);
        ajuste = await ajustar(detalles.slice(1, 2));
        assert.equal(ajuste.devolver, 10);
        await ajustar(detalles.slice(1, 2), true, 10, 20);
        const reembolso = await uno(
          "select d.id_devolucion from devolucion d join pago using(id_pago) where id_venta=$1 limit 1",
          [v],
        );
        await q("select confirmar_devolucion($1)", [reembolso]);
        assert.equal(
          (
            await uno(
              "select numeros from vw_comprobantes where token_grupo=$1",
              [token],
            )
          ).length,
          4,
        );
        await q("select anular_rifa($1,'Evento suspendido')", [id]);
        assert.equal(
          await uno("select estado from vw_comprobantes where token_grupo=$1", [
            token,
          ]),
          "anulado",
        );
        assert.equal(
          await uno(
            "select recaudacion from vw_resumen_rifa where id_rifa=$1",
            [id],
          ),
          "0",
        );
        assert.equal(
          Number(
            await uno(
              "select por_devolver+devuelto from vw_estados_rifa where id_rifa=$1",
              [id],
            ),
          ),
          20,
        );
        await assert.rejects(compra(ns.slice(8, 9), 10));
        await assert.rejects(pago(v, 1));
        await assert.rejects(q("select iniciar_sorteo($1)", [id]));
        await assert.rejects(q("select anular_rifa($1,'Otra vez')", [id]));
        await q("reset role");
        await q("set role service_role");
        assert.equal(
          (await uno("select consultar_boleto($1)", [token])).estado_rifa,
          "anulada",
        );
        await q("reset role");
        await q("set role authenticated");
      },
    );
    await t.test(
      "Tarifas originales y devolución del dinero efectivamente recibido",
      async () => {
        const crear = async (id, precio) =>
          uno(
            "select guardar_rifa_ofertas('Tres por veinticinco',10,12,now(),'numero',null,null,$1,$2)",
            [id, JSON.stringify([{ cantidad: 3, precio, activa: true }])],
          );
        const id = await crear(null, 25);
        const nums = (
          await q(
            "select id_numero_rifa from numero_rifa where id_rifa=$1 order by numero",
            [id],
          )
        ).map((n) => n.id_numero_rifa);
        const venta = async (ids) =>
          uno("select registrar_venta($1,$2,$3)", [id, persona, ids]);
        const completa = await venta(nums.slice(0, 3)),
          parcial = await venta(nums.slice(3, 6)),
          cuatro = await venta(nums.slice(6, 10));
        await pago(completa, 25);
        await pago(parcial, 15);
        await crear(id, 19);
        const linea = await uno(
          "select id_detalle_venta from detalle_venta where id_venta=$1 limit 1",
          [cuatro],
        );
        assert.equal(
          (await uno("select ajustar_numeros_venta($1,$2)", [cuatro, [linea]]))
            .total,
          25,
        );
        await q("select anular_rifa($1,'Evento cancelado')", [id]);
        for (const [v, esperado] of [
          [completa, 25],
          [parcial, 15],
          [cuatro, 0],
        ])
          assert.equal(
            Number(
              await uno(
                "select coalesce(sum(d.importe),0) from devolucion d join pago p using(id_pago) where p.id_venta=$1",
                [v],
              ),
            ),
            esperado,
          );
        const publico = await uno(
          "select token_consulta from rifa where id_rifa=$1",
          [id],
        );
        await q("reset role");
        await q("set role service_role");
        assert.equal(
          (await uno("select consultar_boleto($1)", [publico])).estado,
          "anulada",
        );
        await q("reset role");
        await q("set role authenticated");
      },
    );
    await t.test(
      "Anulación antes y durante el sorteo conserva el ganador",
      async () => {
        const vacia = await crear("numero");
        await q("select anular_rifa($1,'Sin ventas')", [vacia]);
        const id = await crear("numero");
        const ids = (
          await q(
            "select id_numero_rifa from numero_rifa where id_rifa=$1 limit 2",
            [id],
          )
        ).map((n) => n.id_numero_rifa);
        const v = await vender(ids, id);
        await pago(v, 20);
        for (let i = 1; i <= 2; i++)
          await q("select guardar_premio($1,$2,$3,1,false)", [
            id,
            "Premio " + i,
            i,
          ]);
        await q("select iniciar_sorteo($1)", [id]);
        const premio = await uno(
          "select id_premio_rifa from premio_rifa where id_rifa=$1 order by orden_sorteo",
          [id],
        );
        await q("select extraer_numero_sorteo($1,$2,1,$3)", [
          id,
          premio,
          randomUUID(),
        ]);
        await assert.rejects(q("select anular_rifa($1,'Interrupción')", [id]));
        await q("select anular_rifa($1,'Interrupción','Noviembre')", [id]);
        assert.equal(
          await uno(
            "select count(*) from vw_historial_ganadores where id_rifa=$1",
            [id],
          ),
          "1",
        );
        await assert.rejects(q("select finalizar_sorteo($1)", [id]));
        const devolucion = await uno(
          "select id_devolucion from devolucion join pago using(id_pago) where id_venta=$1",
          [v],
        );
        await q("select confirmar_devolucion($1)", [devolucion]);
        await q("select confirmar_devolucion($1)", [devolucion]);
        assert.equal(
          Number(
            await uno("select devuelto from vw_estados_rifa where id_rifa=$1", [
              id,
            ]),
          ),
          20,
        );
        await assert.rejects(q("select anular_rifa($1,'Terminada')", [r]));
      },
    );
    await t.test(
      "Ventas en vivo, reserva indefinida, precio y dos conexiones durante la extracción",
      async () => {
        const id = await uno(
          "select guardar_rifa('En vivo',10,90,now(),'numero')",
        );
        const personaViva = await uno(
          "select guardar_persona('Participante en vivo')",
        );
        const ns = (
          await q(
            "select id_numero_rifa from numero_rifa where id_rifa=$1 order by numero",
            [id],
          )
        ).map((n) => n.id_numero_rifa);
        const vender = (ids, reserva = null) =>
          uno("select registrar_venta($1,$2,$3,$4)", [
            id,
            personaViva,
            ids,
            reserva,
          ]);
        const reserva = await uno("select reservar_numeros($1,$2,$3,null)", [
          id,
          personaViva,
          [ns[62]],
        ]);
        await q("reset role");
        await q("select vencer_reservas()");
        await q("set role authenticated");
        assert.equal(
          await uno("select estado from reserva where id_reserva=$1", [
            reserva,
          ]),
          "activa",
        );
        await assert.rejects(
          q("select reservar_numeros($1,$2,$3,now()-interval '1 minute')", [
            id,
            personaViva,
            [ns[63]],
          ]),
          /futuro/,
        );
        await pago(await vender(ns.slice(0, 62)), 620);
        for (let i = 1; i <= 2; i++)
          await q("select guardar_premio($1,'Premio '||$2::int,$2,1,false)", [
            id,
            i,
          ]);
        const premios = (
          await q(
            "select id_premio_rifa from premio_rifa where id_rifa=$1 order by orden_sorteo",
            [id],
          )
        ).map((p) => p.id_premio_rifa);
        await q("select configurar_ventas_sorteo($1,true,5)", [id]);
        await q("select iniciar_sorteo($1)", [id]);
        await q("select cambiar_apertura_ventas($1,false)", [id]);
        await assert.rejects(vender([ns[63]]), /cerradas/);
        await q("select cambiar_apertura_ventas($1,true)", [id]);
        const convertida = await vender([ns[62]], reserva);
        assert.equal(
          Number(
            await uno("select total from venta where id_venta=$1", [
              convertida,
            ]),
          ),
          10,
        );
        const posterior = await vender([ns[63]]);
        assert.equal(
          Number(
            await uno("select total from venta where id_venta=$1", [posterior]),
          ),
          5,
        );
        const candidatos = (
          await uno("select resumen_candidatos($1,$2)", [id, premios[0]])
        ).muestra;
        assert.equal(candidatos.length, 62);
        await assert.rejects(
          q("select extraer_numero_sorteo($1,$2,1,$3,array[1])", [
            id,
            premios[0],
            randomUUID(),
          ]),
          /cambiaron/,
        );
        await q("begin");
        let abono;
        try {
          const e = (
            await q("select * from extraer_numero_sorteo($1,$2,1,$3,$4)", [
              id,
              premios[0],
              randomUUID(),
              candidatos,
            ])
          )[0];
          abono = otra.query("select confirmar_pago($1,5,'yape')", [posterior]);
          assert.deepEqual(e.numeros_elegibles, candidatos);
          await q("commit");
        } catch (error) {
          await q("rollback");
          throw error;
        }
        await abono;
        const siguientes = (
          await uno("select resumen_candidatos($1,$2)", [id, premios[1]])
        ).muestra;
        assert.ok(siguientes.includes(64));
        assert.ok(!siguientes.includes(63));
        assert.equal(siguientes.length, 62);
        await q("select extraer_numero_sorteo($1,$2,1,$3,$4)", [
          id,
          premios[1],
          randomUUID(),
          siguientes,
        ]);
        await assert.rejects(vender([ns[64]]), /cerradas/);
        await assert.rejects(
          q("select cambiar_apertura_ventas($1,true)", [id]),
          /admite/,
        );
        await q("select finalizar_sorteo($1)", [id]);
        assert.equal(
          await uno("select ventas_abiertas from rifa where id_rifa=$1", [id]),
          false,
        );
      },
    );
    await t.test(
      "Un mismo token publica los 25 premios, protege sorpresas y refleja cambios de lugar",
      async () => {
        const id = await crear("numero");
        for (let i = 1; i <= 25; i++)
          await q("select guardar_premio($1,'Secreto '||$2::int,$2,1,$2=1)", [
            id,
            i,
          ]);
        const ids = (
          await q(
            "select id_numero_rifa from numero_rifa where id_rifa=$1 order by numero limit 2",
            [id],
          )
        ).map((n) => n.id_numero_rifa);
        const venta = await vender(ids, id);
        await pago(venta, 20);
        const token = await uno(
          "select token_grupo from vw_comprobantes where id_rifa=$1",
          [id],
        );
        async function consultar() {
          await q("reset role");
          await q("set role service_role");
          try {
            return await uno("select consultar_boleto($1)", [token]);
          } finally {
            await q("reset role");
            await q("set role authenticated");
          }
        }
        for (const modo of ["sin_definir", "meet", "presencial"]) {
          await q("select guardar_transmision($1,$2,null,$3,$4,$5)", [
            id,
            modo,
            modo === "meet" ? "https://meet.google.com/abc" : null,
            modo === "presencial" ? "Av. Lima" : null,
            null,
          ]);
          const datos = await consultar();
          assert.equal(datos.modalidad, modo);
          assert.equal(datos.premios_publicos.length, 25);
          assert.equal(datos.premios_publicos[0].nombre, "Premio sorpresa");
          assert.equal(datos.premios_publicos[0].imagen, null);
          assert.equal(datos.telefono, undefined);
        }
        await q("select cancelar_venta($1,'Solicitud del titular')", [venta]);
        assert.equal((await consultar()).estado, "anulado");
        assert.equal(
          await uno(
            "select estado_antes_anulacion from venta where id_venta=$1",
            [venta],
          ),
          "pagada",
        );
        assert.equal(
          Number(
            await uno(
              "select recaudacion from vw_resumen_rifa where id_rifa=$1",
              [id],
            ),
          ),
          0,
        );
      },
    );
    await t.test("Participación por rifa con ventas sin abonos, parciales y reservas", async () => {
      const id = await crear("persona");
      const ids = (await q("select id_numero_rifa from numero_rifa where id_rifa=$1 order by numero", [id])).map(x => x.id_numero_rifa);
      await pago(await vender([ids[0]], id), 10);
      await vender([ids[1]], id);
      await pago(await vender([ids[2]], id), 3);
      const titular = await uno("select guardar_persona('Titular de reserva')");
      const reservar = (n) => uno("select reservar_numeros($1,$2,$3,null)", [id, titular, [ids[n]]]);
      const reservaGanadora = await reservar(3);
      await q("select liberar_reserva($1)", [await reservar(4)]);
      await q("select cancelar_venta($1,'Cancelación')", [await vender([ids[5]], id)]);
      const vencida = await reservar(6);
      await q("reset role");
      await q("update reserva set fecha_vencimiento=now()-interval '1 second' where id_reserva=$1", [vencida]);
      await q("set role authenticated");
      const muestra = async (premio = null) => (await uno("select resumen_candidatos($1,$2)", [id,premio])).muestra;
      assert.deepEqual(await muestra(), [1]);
      await q("select configurar_participacion($1,true)", [id]);
      assert.deepEqual(await muestra(), [1,2,3,4]);
      await q("select configurar_participacion($1,false)", [id]);
      assert.deepEqual(await muestra(), [1]);
      await q("select configurar_participacion($1,true)", [id]);
      for (const orden of [1,2])
        await q("select guardar_premio($1,'Premio', $2,1,false)", [id,orden]);
      const premios = (await q("select id_premio_rifa from premio_rifa where id_rifa=$1 order by orden_sorteo",[id])).map(p => p.id_premio_rifa);
      await q("select iniciar_sorteo($1)", [id]);
      await assert.rejects(q("select configurar_participacion($1,false)", [id]), /inició/);
      assert.deepEqual(await muestra(premios[0]), [1,2,3,4]);
      for (const premio of premios) {
        const antes = await muestra(premio);
        await q("select extraer_numero_sorteo($1,$2,1,$3,$4)", [id,premio,randomUUID(),antes]);
      }
      await q("reset role");
      await q("update reserva set fecha_vencimiento=now()-interval '1 second' where id_reserva=$1", [reservaGanadora]);
      await q("select vencer_reservas()");
      await q("set role authenticated");
      const ganadores = await q("select id_persona,numero from vw_historial_ganadores where id_rifa=$1", [id]);
      assert.equal(ganadores.length, 2);
      assert.equal(ganadores.find(g => g.id_persona===titular)?.numero, 4);
      assert.ok(ganadores.some(g => g.id_persona===persona));
    });
    await t.test("Una conversión y una venta en vivo entran una sola vez sin pago", async () => {
      const id = await crear("numero");
      const ids = (await q("select id_numero_rifa from numero_rifa where id_rifa=$1 order by numero limit 2", [id])).map(n => n.id_numero_rifa);
      const reserva = await uno("select reservar_numeros($1,$2,$3,null)", [id, persona, [ids[0]]]);
      await q("select guardar_premio($1,'En vivo',1,1,false)", [id]);
      const premio = await uno("select id_premio_rifa from premio_rifa where id_rifa=$1", [id]);
      await q("select configurar_ventas_sorteo($1,true,5)", [id]);
      await q("select configurar_participacion($1,true)", [id]);
      await q("select iniciar_sorteo($1)", [id]);
      await q("select registrar_venta($1,$2,$3,$4)", [id, persona, [ids[0]], reserva]);
      const venta = await vender([ids[1]], id);
      const muestra = async () => (await uno("select resumen_candidatos($1,$2)", [id,premio])).muestra;
      assert.deepEqual(await muestra(), [1,2]);
      await pago(venta,5);
      assert.deepEqual(await muestra(), [1,2]);
      await assert.rejects(q("select extraer_numero_sorteo($1,$2,1,$3,array[1])", [id,premio,randomUUID()]), /cambiaron/);
    });
    await t.test("RLS y privilegios", async () => {
      const temporal = await uno("select guardar_persona('Temporal')");
      await q("select guardar_persona('Editada',null,'123456789',$1)", [
        temporal,
      ]);
      assert.equal(
        await uno("select nombres from persona where id_persona=$1", [
          temporal,
        ]),
        "Editada",
      );
      await q("select eliminar_persona($1)", [temporal]);
      assert.equal(
        await uno("select count(*) from persona where id_persona=$1", [
          temporal,
        ]),
        "0",
      );
      await assert.rejects(
        q("select eliminar_persona($1)", [persona]),
        /historial/,
      );
      await assert.rejects(q("update rifa set precio_numero=1"));
      await q("select set_config('request.jwt.claim.sub',$1,false)", [
        randomUUID(),
      ]);
      assert.equal(await uno("select count(*) from venta"), "0");
      await q("reset role");
      await q("set role anon");
      for (const tabla of ["persona", "pago", "venta"])
        await assert.rejects(q("select * from " + tabla));
    });
  } finally {
    await db.end();
    await otra.end();
    await pg.stop();
  }
});
