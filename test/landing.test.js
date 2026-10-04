import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createLandingRouter } from "../route/landing.route.js";
import globalErrorHandler from "../middleware/globalErrorHandler.js";
import notFound from "../middleware/notFound.js";
import { corsOptions } from "../utils/corsOptions.js";
import AppError from "../errors/AppError.js";
import { protect } from "../middleware/auth.middleware.js";
import { User } from "../model/user.model.js";
import jwt from "jsonwebtoken";

test("seller interest validates, persists, handles failures and rate limits", async (t) => {
  const calls = [];
  const store = { findOneAndUpdate: async (...args) => { calls.push(args); } };
  const app = express();
  app.use(express.json());
  app.use("/landing", createLandingRouter(store));
  app.use(notFound);
  app.use(globalErrorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/landing/seller-interest`;
  const valid = { name: " Alex ", email: "Alex@Example.com", business: "Sample business", offering: "Products" };
  const post = (data) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  let response = await post(valid);
  assert.equal(response.status, 201);
  assert.deepEqual(calls[0][0], { email: "alex@example.com" });
  assert.equal(calls[0][1].$set.name, "Alex");
  assert.equal(calls[0][2].upsert, true);
  assert.deepEqual(await response.json(), { success: true, message: "Your seller interest has been received." });
  for (const invalid of [{ ...valid, email: "bad" }, { ...valid, name: { $gt: "" } }, { ...valid, business: " " }, { ...valid, offering: "Other" }, { ...valid, name: "a".repeat(101) }]) {
    response = await post(invalid);
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 1);
  const failed = { ...valid, email: "fail@example.com" };
  store.findOneAndUpdate = async () => { throw new Error("database unavailable"); };
  assert.equal((await post(failed)).status, 500);
  store.findOneAndUpdate = async () => {};
  let limited;
  for (let i = 0; i < 11; i++) limited = await post({ ...valid, email: "limited@example.com" });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await post({ ...valid, email: "another@example.com" })).status, 201);
  response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(response.status, 400);
  assert.equal((await fetch(url + "/missing")).status, 404);
});

test("production error responses omit internal details", () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    let result;
    const res = { status(code) { assert.equal(code, 500); return this; }, json(value) { result = value; } };
    globalErrorHandler(new Error("private connection string"), {}, res, () => {});
    assert.equal(result.message, "Something went wrong. Please try again later.");
    assert.equal("stack" in result, false);
    assert.equal("err" in result, false);
    assert.deepEqual(result.errorSources, []);
    assert.equal(new AppError(400, "Invalid input").statusCode, 400);
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});

test("CORS permits configured origins and rejects other origins", () => {
  const old = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://example.com";
  try {
    corsOptions.origin("https://example.com", (err, allowed) => assert.equal(allowed, true));
    corsOptions.origin("https://other.example", (err, allowed) => assert.equal(allowed, false));
    corsOptions.origin(undefined, (err, allowed) => assert.equal(allowed, true));
  } finally {
    if (old === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = old;
  }
});

test("authentication rejects a token whose user was deleted", async () => {
  const original = User.findById;
  const secret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "test-secret-only";
  User.findById = async () => null;
  try {
    const token = jwt.sign({ _id: "507f1f77bcf86cd799439011" }, process.env.JWT_ACCESS_SECRET);
    await assert.rejects(protect({ headers: { authorization: `Bearer ${token}` } }, {}, () => assert.fail("must not authorize")), { statusCode: 401 });
  } finally {
    User.findById = original;
    if (secret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = secret;
  }
});
