import jsQR from "jsqr";
import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { test, expect } from "@playwright/test";
test.use({ hasTouch: true });
const usuario = "a16acdee-e0be-4550-9189-94d4563b4bb4";
const rifaid = "10000000-e0be-4550-9189-94d4563b4bb4";
test("Inicio de sesión, rifa, navegación y tema en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = {
    id: usuario,
    aud: "authenticated",
    role: "authenticated",
    email: "admin@example.invalid",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  };
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      {
        sub: usuario,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
      },
    ]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".") + ".AA";
  const personas = [
    { id_persona: "alonso", nombres: "Alonso Sánchez", telefono: "991111111" },
  ];
  let premio: Record<string, unknown> | null = null;
  let usuarioTikTok = "";
  let asignacion = "";
  let creada = false;
  let abonado = 0;
  let iniciado = false,
    sorteado = false;
  let plantilla = {
    titulo: "Diseño actual",
    mostrar_premio: true,
    mostrar_qr: true,
    mostrar_lugar: false,
    tema: "navidad",
    fondo_url: "https://pruebas.supabase.co/imagen/navidad.png" as
      string | null,
  };
  await page.route("https://pruebas.supabase.co/**", async (route) => {
    const ruta = new URL(route.request().url()).pathname;
    let data: unknown = [];
    const numeros = [7, 9, 25, 30];
    if (ruta.endsWith("/cotizar_compra"))
      data = {
        total: route.request().postDataJSON().p_cantidad * 5,
        ofertas: [],
      };
    if (ruta.endsWith("/vw_premios_rifa")) data = premio ? [premio] : [];
    if (ruta.endsWith("/iniciar_sorteo")) iniciado = true;
    if (ruta.endsWith("/resumen_candidatos"))
      data = { numeros: 4, participantes: 2, muestra: numeros };
    if (ruta.endsWith("/extraer_numero_sorteo")) {
      sorteado = true;
      data = { es_ganadora: true, id_numero_rifa: "7" };
    }
    if (iniciado && ruta.endsWith("/sorteo")) data = [{ id_sorteo: "oficial" }];
    if (iniciado && ruta.endsWith("/vw_premios_rifa"))
      data = [
        premio,
        {
          ...premio,
          id_premio_rifa: "segundo",
          orden_sorteo: 2,
          nombre: "Cafetera",
          es_sorpresa: false,
        },
      ];
    if (sorteado && ruta.endsWith("/vw_historial_ganadores"))
      data = [
        {
          orden_sorteo: 1,
          premio: "Ventilador",
          numero: 7,
          participante: "Alonso",
        },
      ];
    if (ruta.endsWith("/guardar_premio_con_prioridad")) {
      const f = route.request().postDataJSON();
      premio = {
        id_premio_rifa: "premio",
        nombre: f.p_nombre,
        orden_sorteo: f.p_orden,
        numero_extraccion_ganadora: f.p_extraccion,
        es_sorpresa: f.p_sorpresa,
        prioridad: f.p_prioridad,
        estado: "pendiente",
      };
    }
    if (ruta.endsWith("/persona")) data = personas;
    if (ruta.endsWith("/numero_rifa"))
      data = numeros.map((n) => ({
        id_numero_rifa: String(n),
        numero: n,
        estado: "disponible",
      }));
    if (ruta.endsWith("/guardar_persona")) {
      const f = route.request().postDataJSON();
      personas.push({
        id_persona: "nueva",
        nombres: f.p_nombres,
        telefono: f.p_telefono,
      });
      data = "nueva";
    }
    if (ruta.endsWith("/registrar_venta_cotizada")) {
      const f = route.request().postDataJSON();
      expect(f.p_numeros).toEqual(["7"]);
      asignacion = f.p_persona;
      data = "venta";
    }
    if (ruta.endsWith("/plantilla_boleto")) data = [plantilla];
    if (ruta.endsWith("/guardar_transmision"))
      usuarioTikTok = route.request().postDataJSON().p_usuario;
    if (ruta.endsWith("/guardar_plantilla_con_fotos")) {
      const cambios = route.request().postDataJSON();
      expect(cambios.p_fondo).toBeNull();
      expect(cambios.p_fotos).toBe(false);
      expect(cambios.p_tema).toBe("verano");
      plantilla = {
        ...plantilla,
        titulo: cambios.p_titulo,
        tema: cambios.p_tema,
        fondo_url: cambios.p_fondo,
        mostrar_premio: cambios.p_premio,
      };
    }
    if (ruta.endsWith("/vw_detalle_ventas"))
      data = numeros.map((n) => ({
        id_venta: n === 7 ? "parcial" : "otra-venta",
        numero: n,
        fecha_venta: "2026-12-01T12:00:00Z",
        total: 20,
        id_detalle_venta: String(n),
        id_persona: n === 25 ? "otra" : "alonso",
      }));
    if (ruta.endsWith("/vw_boletos_rifa") || ruta.endsWith("/vw_comprobantes"))
      data = (ruta.endsWith("/vw_comprobantes") ? [7, 25] : numeros).map(
        (n) => ({
          id_detalle_venta: String(n),
          id_persona: n === 25 ? "otra" : "alonso",
          token_publico: "prueba-" + n,
          token_grupo: "prueba-" + n,
          numeros: n === 7 ? [7, 9] : [n],
          estado_rifa: "activa",
          estado: n === 30 ? "anulado" : "emitido",
          datos_emision_historicos: {
            numero: n,
            premio: "Ventilador",
            participante: "Alonso Sánchez",
            fecha: "2026-12-24T15:00:00Z",
            rifa: "Rifa de prueba",
            plantilla: { titulo: "Boleto", tema: "elegante", mostrar_qr: true },
          },
        }),
      );
    if (ruta.endsWith("/configuracion_transmision"))
      data = [{ modalidad: "presencial" }];
    if (ruta.includes("/auth/v1/token"))
      data = {
        access_token: token,
        refresh_token: "test",
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
    if (ruta.endsWith("/perfil")) data = [{ id_perfil: usuario }];
    if (ruta.endsWith("/rifa") && !creada)
      data = ["Navidad", "Verano"].map((nombre) => ({
        id_rifa: nombre,
        nombre,
        estado: "terminada",
        fecha_sorteo: "2026-12-24T15:00:00Z",
        cantidad_numeros: 60,
      }));
    if (ruta.endsWith("/rifa") && !creada)
      data = [
        ...(data as object[]),
        ...[
          ["Posterior", 5],
          ["Vencida", -2],
          ["Próxima", 1],
        ].map(([nombre, d]) => ({
          id_rifa: nombre,
          nombre,
          estado: "activa",
          fecha_sorteo: new Date(
            Date.now() + Number(d) * 86400000,
          ).toISOString(),
          cantidad_numeros: 20,
        })),
      ];
    if (ruta.endsWith("/vw_resumen_rifa") && !creada)
      data = [
        {
          id_rifa: "Navidad",
          vendidos: 12,
          recaudacion: 120,
          disponibles: 48,
          reservados: 0,
        },
        {
          id_rifa: "Verano",
          vendidos: 17,
          recaudacion: 170,
          disponibles: 43,
          reservados: 0,
        },
      ];
    if (ruta.endsWith("/venta"))
      data = [
        {
          id_venta: "parcial",
          id_persona: "alonso",
          total: 20,
          estado: abonado === 20 ? "pagada" : "pendiente",
          fecha_venta: "2026-12-01T10:00:00Z",
        },
      ];
    if (ruta.endsWith("/vw_pagos_historicos"))
      data = Array.from({ length: abonado / 10 }, (_, i) => ({
        id_pago: i,
        id_venta: "parcial",
        importe: 10,
        medio_pago: "yape",
        fecha_pago: "2026-12-01T12:00:00Z",
      }));
    if (ruta.endsWith("/vw_pagos_pendientes") && abonado < 20)
      data = [{ id_venta: "parcial", saldo: 20 - abonado }];
    if (ruta.endsWith("/confirmar_pago"))
      abonado += route.request().postDataJSON().p_importe;
    if (ruta.endsWith("/guardar_rifa_ofertas")) {
      expect(route.request().postDataJSON().p_ofertas).toEqual([
        { cantidad: 3, precio: 12, activa: true },
      ]);
      creada = true;
      data = rifaid;
      expect(route.request().postDataJSON().p_nombre).toBe("Rifa de prueba");
    }
    if (ruta.endsWith("/rifa") && creada)
      data = [
        {
          id_rifa: rifaid,
          nombre: "Rifa de prueba",
          precio_numero: 5,
          cantidad_numeros: 50,
          estado: iniciado ? "en_sorteo" : "activa",
          regla_ganador: "numero",
          fecha_sorteo: "2026-12-24T15:00:00Z",
        },
      ];
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("admin@example.invalid");
  await page.getByLabel("Contraseña").fill("solo-prueba");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(
    page.getByRole("heading", { name: "Resumen general" }),
  ).toBeVisible();
  await expect(page.locator(".tarjeta h3").first()).toHaveText("Próxima");
  await expect(page.locator(".tarjeta").nth(2)).toContainText("Fecha vencida");
  await page.getByRole("button", { name: "Cambiar tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  await expect(page.locator(".metricas")).toContainText("290.00");
  await page.getByLabel("Estadísticas de").selectOption("Verano");
  await expect(page.locator(".metricas")).toContainText("170.00");
  await expect(
    page.locator(".metricas article").filter({ hasText: "disponibles" }),
  ).toContainText("43");
  await page.getByRole("button", { name: "Nueva rifa" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Rifa de prueba");
  await page.getByLabel("Precio por número").fill("5");
  await page.getByRole("button", { name: "Agregar oferta" }).click();
  await page
    .getByLabel("Cantidad de números", { exact: true })
    .last()
    .fill("3");
  await page.getByLabel("Precio de la oferta").fill("12");
  await expect(page.locator(".ofertas")).toContainText("3.00");
  await page.getByLabel("Fecha y hora de la rifa").fill("2026-12-24T10:00");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByRole("heading", { name: "Rifa de prueba" }),
  ).toBeVisible();
  const alta = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Agregar premio" }) });
  const ayuda = alta.getByRole("button", {
    name: "Ayuda sobre Número ganador",
  });
  await ayuda.tap();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await ayuda.tap();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await ayuda.focus();
  await ayuda.press("Enter");
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page
    .getByRole("tooltip")
    .screenshot({ path: test.info().outputPath("ayuda.png") });
  await ayuda.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 844 });
  await ayuda.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await alta.getByLabel("Nombre del premio").fill("Ventilador");
  await alta.getByRole("switch", { name: "Sorpresa" }).check();
  await alta.getByRole("switch", { name: "Destacar en boleto" }).check();
  await alta.getByLabel("Prioridad en el boleto").selectOption("3");
  await alta.getByRole("button", { name: "Guardar" }).click();
  const editar = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Ventilador" }) });
  await editar.locator("summary").click();
  await expect(editar.getByRole("switch", { name: "Sorpresa" })).toBeChecked();
  await expect(
    editar.getByRole("switch", { name: "Destacar en boleto" }),
  ).toBeChecked();
  await expect(editar.getByLabel("Prioridad en el boleto")).toHaveValue("3");
  await page.getByRole("button", { name: "Números y ventas" }).click();
  await expect(
    page.getByRole("heading", { name: "Números de la rifa" }),
  ).toBeVisible();
  const ventaParcial = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Sin pagos" }) });
  await ventaParcial.locator("summary").click();
  const importe = page.getByLabel("Importe del abono", { exact: true });
  const registrar = page.getByRole("button", {
    name: "Registrar abono",
    exact: true,
  });
  await expect(importe).toHaveValue("0.00");
  await expect(registrar).toBeDisabled();
  for (const v of ["-1", "21", "1.234"]) {
    await importe.fill(v);
    await expect(registrar).toBeDisabled();
  }
  await importe.fill("10");
  await expect(page.locator(".previa-pago dd").last()).toContainText("10.00");
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".form-abono")
      .screenshot({ path: test.info().outputPath("abono-" + width + ".png") });
  }
  await page.getByRole("button", { name: "Registrar abono" }).click();
  await expect(
    page.locator("summary").filter({ hasText: "Pago parcial" }),
  ).toContainText("10.00");
  await expect(page.getByLabel("Importe del abono")).toHaveAttribute(
    "max",
    "10",
  );
  await expect(importe).toHaveValue("0.00");
  await page.getByRole("button", { name: "Pagar saldo completo" }).click();
  await page.getByRole("button", { name: "Registrar abono" }).click();
  await expect(page.locator(".movimiento").first()).toContainText(
    "Pago de saldo pendiente",
  );
  await page
    .locator(".resumen-pagos")
    .screenshot({ path: test.info().outputPath("historial.png") });
  await expect(
    page.locator("summary").filter({ hasText: "pagada" }),
  ).toContainText("20.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Número 7, disponible", exact: true })
    .click();
  const buscar = page.getByLabel("Buscar participante");
  await buscar.fill("Al");
  await expect(
    page.getByRole("button", { name: /Alonso Sánchez/ }),
  ).toHaveCount(0);
  await buscar.fill("alo");
  await page.getByRole("button", { name: /Alonso Sánchez/ }).click();
  await page.getByRole("button", { name: "Registrar venta" }).click();
  await expect.poll(() => asignacion).toBe("alonso");
  await page
    .getByRole("button", { name: "Número 7, disponible", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Registrar nuevo participante" })
    .click();
  await page.getByLabel("Nombre completo").fill("Ana Ruiz");
  await page.getByLabel("Número de teléfono").fill("987654321");
  await page.getByRole("button", { name: "Guardar y seleccionar" }).click();
  await expect(
    page.getByRole("button", { name: "Número 7, disponible", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Registrar venta" }).click();
  await expect.poll(() => asignacion).toBe("nueva");
  await page.getByRole("button", { name: "Boletos", exact: true }).click();
  await page.getByText("Lugar y transmisión", { exact: true }).click();
  await page.getByLabel("Modalidad").selectOption("tiktok");
  await page
    .getByLabel("Usuario o enlace de TikTok")
    .fill("https://www.tiktok.com/@iamalonsosc");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => usuarioTikTok).toBe("iamalonsosc");
  await page.getByText("Lugar y transmisión", { exact: true }).click();
  await page.getByLabel("Seleccionar boleto").selectOption("prueba-7");
  await page.getByText("Compartir por WhatsApp", { exact: true }).click();
  await expect(page.getByLabel("Teléfono para este envío")).toHaveValue(
    "991111111",
  );
  await expect(
    page.getByRole("link", { name: "Abrir WhatsApp" }),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/51991111111\?text=/);
  await expect(page.getByRole("checkbox", { name: "025" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "030" })).toHaveCount(0);
  await expect(page.locator(".numeros-agrupados:visible b")).toHaveText([
    "007",
    "009",
  ]);
  await expect(
    page.getByAltText("QR de consulta del boleto").filter({ visible: true }),
  ).toHaveCount(1);
  const archivo = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar boletos agrupados (ZIP)" })
    .click();
  const zip = await archivo;
  expect(zip.suggestedFilename()).toBe("Boletos-RifaPes.zip");
  const documentos = unzipSync(await readFile((await zip.path())!));
  expect(Object.keys(documentos)).toHaveLength(2);
  for (const [nombre, contenido] of Object.entries(documentos)) {
    const png = PNG.sync.read(Buffer.from(contenido));
    expect(
      jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data,
    ).toBe(new URL("/boleto/" + nombre.slice(7, -4), page.url()).href);
  }
  await page
    .getByText("Plantilla de los boletos de esta rifa", { exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Mostrar fotos de premios" })
    .uncheck();
  await page
    .getByRole("switch", { name: "Mostrar premio", exact: true })
    .uncheck();
  await page.getByRole("radio", { name: "verano" }).check();
  await expect(page.locator(".vista-plantilla .boleto")).toHaveClass(/verano/);
  await expect(page.locator(".vista-plantilla .boleto")).not.toHaveCSS(
    "background-image",
    /navidad\.png/,
  );
  await page.getByLabel("Título", { exact: true }).fill("Boleto actualizado");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator(".boleto.verano:visible")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Descargar PNG" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sorteo", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Iniciar sorteo oficial" }).click();
  const pantalla = page.locator(".transmision");
  await expect(pantalla.getByAltText("Premio sorpresa")).toBeVisible();
  await pantalla
    .locator(".maquina")
    .screenshot({ path: test.info().outputPath("tombola.png") });
  await pantalla.getByRole("button", { name: "Sortear", exact: true }).click();
  await expect(pantalla.getByText("Mezclando los números…")).toBeVisible();
  await expect(
    pantalla.getByRole("button", { name: "Procesando…" }),
  ).toBeDisabled();
  await pantalla
    .locator(".maquina")
    .screenshot({ path: test.info().outputPath("mezcla.png") });
  await expect(pantalla.locator(".salida-oficial")).toHaveText("007");
  await page.reload();
  await page
    .locator("button.tarjeta")
    .filter({ hasText: "Rifa de prueba" })
    .click();
  await page.getByRole("button", { name: "Sorteo", exact: true }).click();
  await expect(
    pantalla.getByRole("button", { name: "Sortear", exact: true }),
  ).toHaveCount(0);
  await expect(
    pantalla.locator(".bola").filter({ hasText: "007 · Alonso" }),
  ).toBeVisible();
  await expect(
    pantalla.getByRole("heading", { name: "Ventilador" }),
  ).toBeVisible();
  await pantalla.screenshot({ path: test.info().outputPath("ganador.png") });
  await pantalla.getByRole("button", { name: "Siguiente premio" }).click();
  await expect(
    pantalla.getByRole("heading", { name: "Cafetera" }),
  ).toBeVisible();
  await expect(
    pantalla.locator(".bola").filter({ hasText: "007 · Alonso" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Participantes", exact: true })
    .click();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByText("2 participantes registrados")).toBeVisible();
    await expect(page.locator(".directorio .persona-fila")).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("Buscar por nombre o teléfono").fill("Ana");
  await expect(page.locator(".directorio .persona-fila")).toHaveCount(1);
  await page.getByRole("button", { name: "Consultar a Ana Ruiz" }).click();
  const ficha = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Ana Ruiz" }) });
  await ficha.getByRole("button", { name: "Editar" }).click();
  await expect(ficha.getByLabel("Teléfono")).toHaveValue("987654321");
  await expect(ficha.getByRole("button", { name: "Eliminar" })).toBeVisible();
});
test("Boleto público, QR, destino y descargas PNG/PDF", async ({ page }) => {
  const destino = "https://teams.microsoft.com/meet/?p=" + "abcdef".repeat(40);
  const codigo = "681ca001-34b7-4256-a390-3cfff5575111";
  await page.route("**/functions/v1/consultar-boleto", (route) =>
    route.fulfill({
      json: {
        codigo,
        rifa: "Rifa de prueba",
        numero: 7,
        participante: "Alonso",
        telefono: "999123456",
        destacados: ["Ventilador"],
        mas_premios: true,
        imagen:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        fecha: "2026-12-24T15:00:00Z",
        estado: "emitido",
        destino,
        plantilla: {
          titulo: "Boleto especial",
          tema: "navidad",
          mostrar_qr: true,
          mostrar_premio: true,
          mostrar_lugar: true,
        },
      },
    }),
  );
  await page.goto("/boleto/" + codigo);
  await expect(
    page.getByRole("heading", { name: "Boleto especial" }),
  ).toBeVisible();
  await expect(page.getByAltText("Fotografía de Rifa de prueba")).toBeVisible();
  await expect(page.getByText("Y MÁS PREMIOS")).toBeVisible();
  await expect(page.getByAltText("QR de consulta del boleto")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver sorteo" })).toHaveAttribute(
    "href",
    destino,
  );
  const ticket = await page.locator(".boleto").boundingBox();
  await expect(page.locator(".datos-titular-boleto").getByRole("link", { name: "Microsoft Teams" })).toHaveAttribute("href", destino);
  await expect(page.locator(".boleto")).not.toContainText(destino);
  await page.getByText("Compartir por WhatsApp", { exact: true }).click();
  const chat = page.getByRole("link", { name: "Abrir WhatsApp" });
  await expect(chat).toBeVisible();
  expect(new URL((await chat.getAttribute("href"))!).searchParams.get("text")).toContain(destino);
  expect(ticket!.width).toBeGreaterThan(ticket!.height * 1.5);
  for (const tipo of ["PNG", "PDF"]) {
    const pendiente = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar " + tipo }).click();
    const descarga = await pendiente;
    if (tipo === "PNG") {
      const png = PNG.sync.read(await readFile((await descarga.path())!));
      expect(
        jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data,
      ).toBe(page.url());
    }
    expect(descarga.suggestedFilename()).toBe(
      "Boleto-007." + tipo.toLowerCase(),
    );
  }
});

test("Premios por espacio y WhatsApp individual con imagen y mensaje", async ({
  page,
}) => {
  let cantidad = 1;
  await page.route("**/functions/v1/consultar-boleto", (route) =>
    route.fulfill({
      json: {
        codigo: "681ca001-34b7-4256-a390-3cfff5575111",
        rifa: "Rifa de verano",
        numero: 7,
        participante: "Alonso",
        estado: "emitido",
        fecha: "2026-12-20T15:00:00Z",
        destacados: Array.from(
          { length: cantidad },
          (_, i) => i + " " + "nombre largo ".repeat(12),
        ),
        plantilla: {
          titulo: "Boleto",
          tema: "verano",
          mostrar_qr: true,
          mostrar_premio: true,
          mostrar_lugar: false,
        },
      },
    }),
  );
  for (cantidad of [1, 5, 10, 25, 80]) {
    await page.goto("/boleto/681ca001-34b7-4256-a390-3cfff5575111");
    await expect(page.locator(".qr-boleto")).toBeVisible();

    const visibles = page.locator(".premios-boleto li:visible");
    if (cantidad <= 10) {
      await expect(visibles).toHaveCount(cantidad);
      await expect(page.locator(".aviso-premios")).toBeHidden();
    } else if (cantidad === 80) {
      await expect(page.locator(".aviso-premios")).toBeVisible();
      expect(await visibles.count()).toBeLessThan(cantidad);
    }
    const lista = page.locator(".premios-boleto");
    expect(await lista.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  }
  await page.getByText("Compartir por WhatsApp").click();
  await page.getByLabel("Mensaje personalizado").fill("Gracias Alonso");

  const archivo = page.getByRole("link", { name: "Descargar imagen" });
  await expect(archivo).toHaveAttribute("href", /^data:image\/png/);
  for (const numero of ["987654321", "51987654321", "+51 987-654-321"]) {
    await page.getByLabel("Teléfono para este envío").fill(numero);
    await expect(
      page.getByRole("link", { name: "Abrir WhatsApp" }),
    ).toHaveAttribute("href", /^https:\/\/wa\.me\/51987654321\?text=/);
  }
  const mensaje = new URL(
    (await page
      .getByRole("link", { name: "Abrir WhatsApp" })
      .getAttribute("href"))!,
  ).searchParams.get("text")!;
  for (const contenido of [
    "Gracias Alonso",
    "Rifa de verano",
    "Alonso",
    "007",
    page.url(),
  ])
    expect(mensaje).toContain(contenido);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        document.body.dataset.archivo = data.files?.[0]?.type;
        document.body.dataset.mensaje = data.text;
      },
    });
  });
  await page.getByLabel("Mensaje personalizado").fill("Tu boleto de verano");
  await page
    .getByRole("button", { name: "Compartir imagen y mensaje" })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-archivo",
    "image/png",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-mensaje",
    /Tu boleto de verano/,
  );
});

test("Cuadrícula completa para 1 a 100 números", async ({ page }) => {
  let cantidad = 1;
  await page.route("**/functions/v1/consultar-boleto", (route) =>
    route.fulfill({
      json: {
        codigo: "681ca001-34b7-4256-a390-3cfff5575111",
        numero: 1,
        numeros: Array.from({ length: cantidad }, (_, i) => i + 1),
        participante: "Participante",
        rifa: "Rifa navideña",
        estado: "emitido",
        estado_rifa: "activa",
        fecha: "2026-12-05T23:00:00Z",
        destacados: [
          "Premio sorpresa",
          ...Array.from(
            { length: 24 },
            (_, i) => i + " Consola de videojuegos",
          ),
        ],
        plantilla: {
          titulo: "Boleto de participación",
          tema: "navidad",
          mostrar_qr: true,
          mostrar_premio: true,
        },
      },
    }),
  );
  for (cantidad of [1, 2, 3, 6, 10, 25, 50, 100]) {
    await page.goto("/boleto/681ca001-34b7-4256-a390-3cfff5575111");
    const numeros = page.locator(".numeros-agrupados b");
    await expect(numeros).toHaveCount(cantidad);
    await expect(numeros.last()).toHaveText(String(cantidad).padStart(3, "0"));
    await expect(page.locator(".qr-boleto")).toBeVisible();
    await expect(page.getByText(/Consultar boleto en/i)).toHaveCount(0);
    if (cantidad === 10) {
      const quinto = (await numeros.nth(4).boundingBox())!;
      const primero = (await numeros.first().boundingBox())!;
      const qr = (await page.locator(".qr-boleto").boundingBox())!;
      const ultimo = (await numeros.last().boundingBox())!;
      expect(quinto.y).toBeCloseTo(primero.y, 0);
      expect(quinto.x + quinto.width).toBeGreaterThan(qr.x);
      expect(qr.y).toBeGreaterThan(ultimo.y + ultimo.height);
    }
    const desborde = await page
      .locator(".boleto")
      .evaluate(
        (el) =>
          el.scrollWidth > el.clientWidth ||
          el.scrollHeight > el.clientHeight + 1,
      );
    expect(desborde).toBe(false);
    if (cantidad === 6 || cantidad === 100)
      await page
        .locator(".boleto")
        .screenshot({
          path: test.info().outputPath("boleto-" + cantidad + ".png"),
        });
  }
});
