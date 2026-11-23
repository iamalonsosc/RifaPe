import { test, expect } from "@playwright/test";
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
    if (ruta.endsWith("/vw_premios_rifa")) data = premio ? [premio] : [];
    if (ruta.endsWith("/iniciar_sorteo")) iniciado = true;
    if (ruta.endsWith("/extraer_numero_sorteo")) sorteado = true;
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
    if (ruta.endsWith("/registrar_venta")) {
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
        id_detalle_venta: String(n),
        id_persona: n === 25 ? "otra" : "alonso",
      }));
    if (ruta.endsWith("/boleto"))
      data = numeros.map((n) => ({
        id_detalle_venta: String(n),
        token_publico: "prueba-" + n,
        estado: n === 30 ? "anulado" : "emitido",
        datos_emision_historicos: {
          numero: n,
          premio: "Ventilador",
          participante: "Alonso Sánchez",
          fecha: "2026-12-24T15:00:00Z",
          rifa: "Rifa de prueba",
          plantilla: { titulo: "Boleto", tema: "elegante", mostrar_qr: true },
        },
      }));
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
    if (ruta.endsWith("/pago"))
      data = Array.from({ length: abonado / 10 }, (_, i) => ({
        id_pago: i,
        id_venta: "parcial",
        importe: 10,
        medio_pago: "yape",
      }));
    if (ruta.endsWith("/vw_pagos_pendientes") && abonado < 20)
      data = [{ id_venta: "parcial", saldo: 20 - abonado }];
    if (ruta.endsWith("/confirmar_pago"))
      abonado += route.request().postDataJSON().p_importe;
    if (ruta.endsWith("/guardar_rifa")) {
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
  await page.getByLabel("Fecha y hora en Perú").fill("2026-12-24T10:00");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByRole("heading", { name: "Rifa de prueba" }),
  ).toBeVisible();
  const alta = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Agregar premio" }) });
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
  await page.getByLabel("Importe recibido").fill("10");
  await page.getByRole("button", { name: "Registrar pago o abono" }).click();
  await expect(
    page.locator("summary").filter({ hasText: "Pago parcial" }),
  ).toContainText("10.00");
  await expect(page.getByLabel("Importe recibido")).toHaveAttribute(
    "max",
    "10",
  );
  await page.getByRole("button", { name: "Registrar pago o abono" }).click();
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
  await expect(page.getByRole("checkbox", { name: "025" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "030" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "009" }).check();
  await expect(
    page.getByAltText("QR de consulta del boleto").filter({ visible: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Preparar foto conjunta" }).click();
  const archivo = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Descargar foto para WhatsApp" })
    .click();
  expect((await archivo).suggestedFilename()).toBe("Boletos-007-009.png");
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
  const conjunta = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Foto conjunta · 2 boletos" }),
  });
  await expect(
    conjunta.getByRole("heading", { name: "Boleto actualizado" }),
  ).toHaveCount(2);
  await expect(conjunta.getByText("Ventilador")).toHaveCount(0);
  await expect(conjunta.locator(".boleto.verano")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Preparar foto conjunta" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "009" }).uncheck();
  await expect(
    page.getByRole("button", { name: "Descargar PNG" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sorteo", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Iniciar sorteo oficial" }).click();
  const pantalla = page.locator(".transmision");
  await pantalla.getByRole("button", { name: "Realizar sorteo" }).click();
  await expect(pantalla.getByText("007 · Alonso")).toBeVisible();
  await expect(
    pantalla.getByRole("heading", { name: "Ventilador" }),
  ).toBeVisible();
  await pantalla.getByRole("button", { name: "Siguiente premio" }).click();
  await expect(
    pantalla.getByRole("heading", { name: "Cafetera" }),
  ).toBeVisible();
  await expect(pantalla.getByText("007 · Alonso")).toHaveCount(0);
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
  const codigo = "681ca001-34b7-4256-a390-3cfff5575111";
  await page.route("**/functions/v1/consultar-boleto", (route) =>
    route.fulfill({
      json: {
        codigo,
        rifa: "Rifa de prueba",
        numero: 7,
        participante: "Alonso",
        destacados: ["Ventilador"],
        mas_premios: true,
        imagen:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        fecha: "2026-12-24T15:00:00Z",
        estado: "emitido",
        destino: "https://teams.microsoft.com/",
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
    "https://teams.microsoft.com/",
  );
  const ticket = await page.locator(".boleto").boundingBox();
  await expect(page.locator(".pie-transmision a")).toHaveAttribute(
    "href",
    "https://teams.microsoft.com/",
  );
  expect(ticket!.width).toBeGreaterThan(ticket!.height * 1.5);
  for (const tipo of ["PNG", "PDF"]) {
    const pendiente = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar " + tipo }).click();
    const descarga = await pendiente;
    expect(descarga.suggestedFilename()).toBe(
      "Boleto-007." + tipo.toLowerCase(),
    );
  }
});
