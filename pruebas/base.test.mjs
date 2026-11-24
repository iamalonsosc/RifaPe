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
      await q(await readFile(join("supabase/migrations", file), "utf8"));
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
          assert.equal(resumen.muestra.length, 12);
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
