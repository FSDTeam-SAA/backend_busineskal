import validator from "validator";
import AppError from "../errors/AppError.js";

export function emailValue(value) {
  if (typeof value !== "string" || value.length > 200 || !validator.isEmail(value.trim())) {
    throw new AppError(400, "Please enter a valid email address.");
  }
  return value.trim().toLowerCase();
}

export function passwordValue(value) {
  if (typeof value !== "string" || value.length < 8 || Buffer.byteLength(value, "utf8") > 72) {
    throw new AppError(400, "Password must be at least 8 characters and at most 72 bytes.");
  }
  return value;
}

export function sellerDetails(body) {
  const details = {};
  for (const [field, max] of Object.entries({ storeName: 150, country: 100, phone: 40 })) {
    const value = body?.[field];
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
      throw new AppError(400, `Please provide a valid ${field === "storeName" ? "business name" : field}.`);
    }
    details[field] = value.trim();
  }
  if (body.storeDescription !== undefined && (typeof body.storeDescription !== "string" || body.storeDescription.length > 1000)) {
    throw new AppError(400, "Business description must be at most 1000 characters.");
  }
  details.storeDescription = body.storeDescription?.trim() || "";
  return details;
}

export function emailQuery(email) {
  return { email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } };
}
