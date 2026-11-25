import { test, expect } from "@playwright/test";

test("Consulta anónima, actualización, filtros y catálogo responsive", async ({
  page,
}) => {
  const token = "31f29e51-292a-41a2-8695-a9cd43bc2a9e";
  const premios = Array.from({ length: 50 }, (_, i) => ({
    orden: i + 1,
    nombre: i === 0 ? "Premio sorpresa" : "Premio " + (i + 1),
    sorpresa: i === 0,
  }));
  const datos = {
    metodo_pago: {tipo:"Plin",nombre:"Plin",referencia:"987654321"},
    nombre: "Rifa de noviembre",
    estado: "activa",
    numeros: Array.from({ length: 220 }, (_, i) => (i === 6 || i === 7 ? -(i+1) : i + 1)),
    reservados: [7],
    comprados_emitidos: [8],
    premios,
  };
  premios[1].nombre = "Dispensador de agua de vidrio con depósito de hielo y base metálica";
  let status = 200,
    consultas = 0;
  await page.route(
    "**/functions/v1/consultar-disponibilidad",
    async (route) => {
      consultas++;
      expect(route.request().postDataJSON()).toEqual({ token });
      await route.fulfill({ status, json: status === 200 ? datos : null });
    },
  );
  await page.clock.install();
  await page.goto("/disponibilidad/" + token);
  await page.reload();
  await expect(page.getByRole("heading", { name: datos.nombre })).toBeVisible();
  await expect(page.locator("meta[name=robots]")).toHaveAttribute(
    "content",
    /noindex/,
  );
  await page.context().grantPermissions(["clipboard-read","clipboard-write"]);
  await page.getByRole("button",{name:"Copiar número de pago"}).click();
  await expect(page.getByRole("status")).toHaveText("Número de pago copiado correctamente");
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe("987654321");
  await page.clock.fastForward(3100);
  await expect(page.getByText("Número de pago copiado correctamente")).toHaveCount(0);
  const grid = page.locator(".numeros-publicos");
  const tema = page.getByRole("button",{name:/Usar tema/});
  const icono = page.locator(".marca svg");
  await expect(icono).toHaveCSS("color","rgb(213, 220, 149)");
  await expect(icono).toHaveCSS("background-color","rgb(54, 89, 62)");
  const siguiente = (await tema.innerText()).endsWith("oscuro") ? "oscuro" : "claro";
  await tema.click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-tema",siguiente);
  await expect(icono).toHaveCSS("color","rgb(213, 220, 149)");
  await expect(grid.locator('[title="Reservado"]')).toHaveText("007");
  await expect(grid.locator(".comprado")).toHaveText("008");
  await expect(grid.locator("span")).toHaveCount(150);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(grid.getByText("220", { exact: true })).toBeVisible();
  const tarjetas = page.locator(".catalogo-premios article");
  for (const width of [320, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    const primera = await tarjetas.nth(0).boundingBox();
    const segunda = await tarjetas.nth(1).boundingBox();
    if (width < 768) {
      expect(segunda!.y).toBeGreaterThanOrEqual(primera!.y + primera!.height);
    } else if (width === 1280) {
      expect(segunda!.y).toBe(primera!.y);
    }
    expect((await tarjetas.first().locator("img").boundingBox())!.width).toBeGreaterThanOrEqual(76);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    ).toBe(true);
  }
  const buscar = page.getByRole("searchbox");
  for (const n of ["007", "7"]) {
    await buscar.fill(n);
    await expect(grid.locator(".ocupado")).toHaveText("007");
  }
  await page.getByLabel("Mostrar solo números disponibles").check();
  await expect(page.getByText(/No encontramos números/)).toBeVisible();
  await page.getByRole("button", { name: "Ver los 50 premios" }).click();
  await expect(page.locator(".catalogo-premios article")).toHaveCount(50);
  await expect(page.locator(".catalogo-premios img")).toHaveAttribute(
    "src",
    "/regalo-sorpresa.svg",
  );
  datos.numeros[6] = 7;
  datos.reservados = [];
  await page.clock.fastForward(10100);
  await expect(grid.locator(".libre")).toHaveText("007");
  await expect(buscar).toHaveValue("7");
  await expect(page.locator(".catalogo-premios article")).toHaveCount(50);
  // La pestaña oculta suspende la consulta y volver al frente la reanuda.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const previas = consultas;
  await page.clock.fastForward(30000);
  expect(consultas).toBe(previas);
  status = 503;
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("alert")).toContainText("desactualizados");
  await expect(grid.locator(".libre")).toHaveText("007");
  datos.premios = [];
  datos.numeros = [-1, -2];
  status = 200;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByText(/serán anunciados/)).toBeVisible();
  await expect(page.getByText(/Todos los números de esta rifa/)).toBeVisible();
  Reflect.deleteProperty(datos, "premios");
  datos.estado = "terminada";
  await page.clock.fastForward(10100);
  await expect(page.getByText(/Esta rifa ha finalizado/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Premios de la rifa" }),
  ).toHaveCount(0);
  datos.estado = "anulada";
  await page.clock.fastForward(10100);
  await expect(page.getByText(/Esta rifa ha sido cancelada/)).toBeVisible();
  status = 404;
  await page.clock.fastForward(10100);
  await expect(
    page.getByRole("heading", { name: /Este enlace ya no/ }),
  ).toBeVisible();
  await expect(page.getByText(datos.nombre)).toHaveCount(0);
});
