import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { getLandingCatalogue } from "../service/landing.service.js";
import { createLandingRouter } from "../route/landing.route.js";
import globalErrorHandler from "../middleware/globalErrorHandler.js";

test("catalogue queries only verified records and publishes explicit public fields", async () => {
  const vendor = { _id: "vendor-1", storeName: "Actual supplier", country: "Bangladesh", email: "private@example.com", password: "private", phone: "private" };
  const category = { name: "Actual category" };
  const product = { _id: "product-1", title: "Actual product", price: 25, packSize: "box", photos: [{ url: "https://example.com/photo.jpg", public_id: "private" }], vendor, category };
  const service = { _id: "service-1", title: "Actual service", description: "Actual description", images: { url: "javascript:alert(1)" }, vendor, category };
  const selections = [];
  const populations = [];
  const model = (rows) => ({ find(filter) {
    assert.deepEqual(filter, { verified: true });
    return {
      select(fields) { selections.push(fields); return this; },
      populate(config) { populations.push(config); return this; },
      sort() { return this; }, limit(value) { assert.equal(value, 100); return this; },
      maxTimeMS(value) { assert.equal(value, 5000); return this; },
      lean: async () => rows,
    };
  } });
  const data = await getLandingCatalogue({
    Product: model([product, { ...product, vendor: null }, { ...product, category: { name: "Hidden", isActive: false } }]),
    Service: model([service]),
  });
  assert.equal(data.listings.length, 2);
  assert.equal(data.listings[0].name, "Actual product");
  assert.equal(data.listings[0].price, "25");
  assert.equal(data.listings[0].image, "https://example.com/photo.jpg");
  assert.equal(data.listings[1].image, "");
  assert.equal(data.listings[1].price, "On request");
  assert.deepEqual(data.suppliers, [{ id: "vendor-1", name: "Actual supplier", location: "Bangladesh", types: ["Products", "Services"] }]);
  assert.equal(JSON.stringify(data).includes("private"), false);
  assert.ok(populations.some((config) => config.path === "vendor" && config.match.$or[0].vendorStatus === "approved"));
  assert.ok(populations.some((config) => config.path === "category" && config.select.includes("isActive")));
  assert.ok(selections.every((fields) => !fields.includes("password")));
  assert.deepEqual(await getLandingCatalogue({ Product: model([]), Service: model([]) }), { listings: [], suppliers: [] });
  const legacy = await getLandingCatalogue({ Product: model([]), Service: model([{ ...service, category: null }]) });
  assert.equal(legacy.listings[0].category, "Uncategorized");
});

test("public catalogue route handles success and unavailable data without authentication", async (t) => {
  const app = express();
  let failing = false;
  app.use("/landing", createLandingRouter({}, async () => {
    if (failing) throw new Error("database unavailable");
    return { listings: [{ id: "product:1", name: "Actual product" }], suppliers: [] };
  }));
  app.use(globalErrorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/landing/catalogue`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).data.listings[0].name, "Actual product");
  failing = true;
  const failed = await fetch(url);
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).success, false);
});
