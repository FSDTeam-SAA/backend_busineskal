// Reflect the requesting origin when credentials are used. Production origins
// should be explicitly listed in CORS_ORIGINS (comma separated).
export const corsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    const allowed = (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    callback(null, !origin || allowed.includes(origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};
