import jwt from "jsonwebtoken";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import { User } from "./../model/user.model.js";

export const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) throw new AppError(httpStatus.UNAUTHORIZED, "Token not found");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    throw new AppError(401, "Invalid token");
  }
  const user = await User.findById(decoded._id);
  if (!user) throw new AppError(401, "User no longer exists");
  if (user.role === "seller" && user.vendorStatus !== "approved") {
    throw new AppError(403, "Your seller account requires admin approval.");
  }
  req.user = user;
  next();
};

export const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    throw new AppError(403, "Access denied. You are not an admin.");
  }
  next();
};

export const isDriver = (req, res, next) => {
  if (req.user?.role !== "driver") {
    throw new AppError(403, "Access denied. You are not an driver.");
  }
  next();
};
