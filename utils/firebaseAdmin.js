import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultServiceAccountPath = path.join(
  __dirname,
  "../firebase-service-account.json"
);

const normalizeServiceAccount = (serviceAccount) => {
  if (!serviceAccount) return null;

  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
};

const parseServiceAccountJson = (rawValue) => {
  if (!rawValue || typeof rawValue !== "string") return null;

  try {
    return normalizeServiceAccount(JSON.parse(rawValue));
  } catch (_) {
    try {
      const decoded = Buffer.from(rawValue, "base64").toString("utf8");
      return normalizeServiceAccount(JSON.parse(decoded));
    } catch (_) {
      return null;
    }
  }
};

const readServiceAccountFile = (serviceAccountPath) => {
  if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(serviceAccountPath, "utf8");
  return parseServiceAccountJson(fileContents);
};

const resolveServiceAccount = () => {
  const envJson = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (envJson) return envJson;

  const envCredentials =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
      ? normalizeServiceAccount({
          project_id: process.env.FIREBASE_PROJECT_ID,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: process.env.FIREBASE_PRIVATE_KEY,
        })
      : null;

  if (envCredentials) return envCredentials;

  const pathCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    defaultServiceAccountPath,
  ].filter(Boolean);

  for (const serviceAccountPath of pathCandidates) {
    const serviceAccount = readServiceAccountFile(serviceAccountPath);
    if (serviceAccount) {
      return serviceAccount;
    }
  }

  return null;
};

let isInitialized = false;

const serviceAccount = resolveServiceAccount();

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  isInitialized = true;
  console.log("Firebase Admin initialized successfully.");
} else {
  console.warn(
    "Firebase Admin credentials were not found. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, GOOGLE_APPLICATION_CREDENTIALS, or provide backend_busineskal/firebase-service-account.json. Google authentication will not work until one of these is configured."
  );
}

export { isInitialized };
export default admin;
