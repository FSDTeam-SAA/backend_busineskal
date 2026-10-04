import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import authRoute from "../route/auth.route.js";
import userRoute from "../route/user.route.js";
import { User } from "../model/user.model.js";
import globalErrorHandler from "../middleware/globalErrorHandler.js";
import { emailValue, passwordValue, sellerDetails } from "../utils/accountValidation.js";

test("account validation rejects unsafe role data, invalid email, weak password and incomplete business details", () => {
  assert.equal(emailValue(" Buyer@Example.com "), "buyer@example.com");
  assert.throws(() => emailValue({ $gt: "" }), { statusCode: 400 });
  assert.throws(() => passwordValue("short"), { statusCode: 400 });
  assert.throws(() => passwordValue("é".repeat(40)), { statusCode: 400 });
  assert.throws(() => sellerDetails({ storeName: "Business" }), { statusCode: 400 });
  assert.deepEqual(sellerDetails({ storeName: " Business ", country: "Bangladesh", phone: "+880123", role: "admin", vendorStatus: "approved" }), {
    storeName: "Business", country: "Bangladesh", phone: "+880123", storeDescription: "",
  });
});

test("buyer signup/login, pending seller signup, buyer conversion and approval restrictions", async (t) => {
  const originals = Object.fromEntries(["findOne", "create", "find", "findById", "findOneAndUpdate"].map((key) => [key, User[key]]));
  const envKeys = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_ACCESS_EXPIRES_IN", "JWT_REFRESH_EXPIRES_IN"];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { JWT_ACCESS_SECRET: "test-access", JWT_REFRESH_SECRET: "test-refresh", JWT_ACCESS_EXPIRES_IN: "1h", JWT_REFRESH_EXPIRES_IN: "7d" });
  const users = [];
  const query = (value) => ({ select: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  User.findOne = (filter) => query(users.find((user) => new RegExp(filter.email.$regex, filter.email.$options).test(user.email)) || null);
  User.find = () => ({ select: async () => [] });
  User.findById = (id) => query(users.find((user) => user._id === String(id)) || null);
  User.create = async (body) => {
    const user = { ...body, _id: String(users.length + 1), password: await bcrypt.hash(body.password, 4), save: async () => {} };
    users.push(user); return user;
  };
  User.findOneAndUpdate = async (filter, update) => {
    const user = users.find((item) => item._id === String(filter._id) && item.role === filter.role);
    if (!user) return null;
    Object.assign(user, update.$set); return user;
  };
  const app = express(); app.use(express.json());
  app.use("/auth", authRoute); app.use("/user", userRoute); app.use(globalErrorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    for (const [key, value] of Object.entries(originals)) User[key] = value;
    for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const buyer = { name: "Buyer", email: "Buyer@Example.com", password: "password123", role: "user" };
  assert.equal((await post("/auth/register", { ...buyer, role: "admin" })).status, 400);
  assert.equal(users.length, 0);
  assert.equal((await post("/auth/register", buyer)).status, 201);
  assert.equal(users[0].email, "buyer@example.com");
  assert.notEqual(users[0].password, buyer.password);
  assert.equal((await post("/auth/register", buyer)).status, 409);
  assert.equal((await post("/auth/login", { email: buyer.email, password: "incorrect" })).status, 401);
  const signed = await post("/auth/login", { email: buyer.email.toUpperCase(), password: buyer.password });
  assert.equal(signed.status, 200);
  const tokens = (await signed.json()).data;
  assert.equal(jwt.verify(tokens.accessToken, process.env.JWT_ACCESS_SECRET).role, "user");
  const buyerApproval = await fetch(base + "/user/sellers/2/status", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ status: "approved" }) });
  assert.equal(buyerApproval.status, 403);
  const business = { storeName: "Actual business", country: "Bangladesh", phone: "+88012345" };
  assert.equal((await post("/user/become-seller", business)).status, 401);
  const conversion = await post("/user/become-seller", { ...business, vendorStatus: "approved", role: "admin" }, tokens.accessToken);
  assert.equal(conversion.status, 200);
  assert.equal((await conversion.json()).data.vendorStatus, "pending");
  assert.equal(users[0].role, "seller");
  assert.equal(users[0].refreshToken, "");
  assert.equal((await post("/auth/login", { email: buyer.email, password: buyer.password })).status, 403);
  assert.equal((await post("/auth/refresh-token", { refreshToken: tokens.refreshToken })).status, 401);
  assert.equal((await post("/user/become-seller", business, tokens.accessToken)).status, 403);
  const seller = { ...buyer, ...business, email: "seller@example.com", role: "seller" };
  const applied = await post("/auth/register", seller);
  assert.equal(applied.status, 201);
  assert.equal((await applied.json()).data.vendorStatus, "pending");
  assert.equal(users[1].storeName, business.storeName);
  users[1].vendorStatus = "rejected";
  assert.equal((await post("/auth/login", seller)).status, 403);
  users[1].vendorStatus = "approved";
  assert.equal((await post("/auth/login", seller)).status, 200);
  const adminAttempt = await fetch(base + "/user/sellers/2/status", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ status: "approved" }) });
  assert.equal(adminAttempt.status, 403);
  assert.equal((await post("/auth/refresh-token", { refreshToken: "invalid" })).status, 401);
});
