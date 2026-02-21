import crypto from "crypto";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { v2 as cloudinary } from "cloudinary";
import nodemailer from "nodemailer";

// Generate a random OTP
export const generateOTP = (length = 6) => {
  // numeric OTP
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

export const hashOTP = (otp) => {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
};

export const isOtpExpired = (expiresAt) =>
  !expiresAt || expiresAt.getTime() < Date.now();

//Generate unique ID
export const generateUniqueId = () => {
  const timestamp = Date.now().toString(36); // Convert current timestamp to base36 string
  const randomPart = Math.random().toString(36).substr(2, 6); // Get 6 random characters

  const uniquePart = timestamp + randomPart;
  const uniqueId = uniquePart.substring(0, 8);

  return `BK${uniqueId}`;
};

//password hashing
export const hashPassword = async (newPassword) => {
  const salt = await bcrypt.genSalt(Number.parseInt(10));
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  return Promise.resolve(hashedPassword);
};

export const uniqueTransactionId = () => {
  return uuidv4().replace(/-/g, "").substr(0, 12).toUpperCase();
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTP = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Verification Code",
    text: `Your verification code is: ${code}`,
  };
  await transporter.sendMail(mailOptions);
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadOnCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { ...options },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(error);
        }
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

export const extractPublicIdFromCloudinaryUrl = (url) => {
  if (!url || typeof url !== "string") return null;

  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const uploadIndex = segments.indexOf("upload");

    if (uploadIndex === -1 || uploadIndex === segments.length - 1) {
      return null;
    }

    const afterUpload = segments.slice(uploadIndex + 1);
    let publicIdParts = afterUpload;

    const versionIndex = [...afterUpload]
      .map((segment, index) => (/^v\d+$/.test(segment) ? index : -1))
      .filter((index) => index !== -1)
      .pop();

    if (versionIndex !== undefined) {
      publicIdParts = afterUpload.slice(versionIndex + 1);
    }

    const publicIdWithExt = publicIdParts.join("/");
    return publicIdWithExt.replace(/\.[^/.]+$/, "");
  } catch (error) {
    return null;
  }
};

export const deleteFromCloudinary = async (publicIds = []) => {
  const ids = Array.isArray(publicIds) ? publicIds : [publicIds];
  const uniqueIds = [
    ...new Set(ids.map((id) => (id || "").toString().trim()).filter(Boolean)),
  ];

  if (uniqueIds.length === 0) return [];

  const results = await Promise.allSettled(
    uniqueIds.map((id) => cloudinary.uploader.destroy(id, { invalidate: true })),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    const error = new Error("Cloudinary delete failed");
    error.details = failures.map((failure) => failure.reason);
    throw error;
  }

  return results.map((result) => result.value);
};
