import express from "express";
import validator from "validator";
import { SellerInterest } from "../model/sellerInterest.model.js";
import AppError from "../errors/AppError.js";
import { getLandingCatalogue } from "../service/landing.service.js";

export function createLandingRouter(store = SellerInterest, loadCatalogue = getLandingCatalogue) {
  const router = express.Router();
  router.get("/catalogue", async (req, res) => {
    const data = await loadCatalogue();
    res.set("Cache-Control", "no-store");
    res.json({ success: true, data });
  });
  const attempts = new Map();
  router.post("/seller-interest", async (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts) {
      if (value.reset <= now) attempts.delete(key);
    }
    // A server-rendered website shares one upstream IP. Scope limits to the
    // email as well so one visitor cannot exhaust every visitor's allowance.
    const emailKey = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 200) : "invalid";
    const key = `${req.ip}:${emailKey}`;
    const bucket = attempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
    attempts.set(key, bucket);
    if (++bucket.count > 10) {
      res.set("Retry-After", String(Math.ceil((bucket.reset - now) / 1000)));
      throw new AppError(429, "Too many submissions. Please try again later.");
    }
    const payload = {};
    for (const [field, limit] of Object.entries({ name: 100, email: 200, business: 150, offering: 30 })) {
      const value = req.body?.[field];
      if (typeof value !== "string" || !value.trim() || value.trim().length > limit) {
        throw new AppError(400, `Please provide a valid ${field}.`);
      }
      payload[field] = value.trim();
    }
    payload.email = payload.email.toLowerCase();
    if (!validator.isEmail(payload.email)) throw new AppError(400, "Please provide a valid email.");
    if (!["Products", "Services", "Products & services"].includes(payload.offering)) {
      throw new AppError(400, "Please select a valid offering.");
    }
    try {
      // Repeat submissions update the existing interest instead of creating duplicates.
      await store.findOneAndUpdate({ email: payload.email }, { $set: payload }, {
        upsert: true, runValidators: true, setDefaultsOnInsert: true,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await store.updateOne({ email: payload.email }, { $set: payload }, { runValidators: true });
    }
    res.status(201).json({ success: true, message: "Your seller interest has been received." });
  });
  return router;
}

export default createLandingRouter();
