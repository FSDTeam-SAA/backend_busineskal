import crypto from "crypto";

const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

const splitCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeUrls = (urls = []) =>
  urls.map((url) => (url.startsWith("stun:") || url.startsWith("turn:") ? url : `turn:${url}`));

const toIceServer = ({ urls, username, credential }) => {
  const payload = { urls };
  if (username) payload.username = username;
  if (credential) payload.credential = credential;
  return payload;
};

const buildSharedSecretTurnServers = () => {
  const secret = process.env.COTURN_SHARED_SECRET;
  const rawUrls = splitCsv(process.env.COTURN_TURN_URLS);

  if (!secret || rawUrls.length === 0) return [];

  const ttlSeconds = Number(process.env.COTURN_CREDENTIAL_TTL_SECONDS || 3600);
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const usernameSuffix = process.env.COTURN_USERNAME_SUFFIX || "busineskal";
  const username = `${expiresAt}:${usernameSuffix}`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return [
    toIceServer({
      urls: normalizeUrls(rawUrls),
      username,
      credential,
    }),
  ];
};

const buildStaticTurnServers = () => {
  const rawUrls = splitCsv(process.env.RTC_TURN_URLS);
  const username = process.env.RTC_TURN_USERNAME;
  const credential = process.env.RTC_TURN_PASSWORD;

  if (rawUrls.length === 0 || !username || !credential) return [];

  return [
    toIceServer({
      urls: normalizeUrls(rawUrls),
      username,
      credential,
    }),
  ];
};

export const getRtcConfigPayload = () => {
  const stunUrls = splitCsv(process.env.RTC_STUN_URLS);
  const iceServers = [
    toIceServer({
      urls: stunUrls.length ? stunUrls : DEFAULT_STUN_URLS,
    }),
    ...buildSharedSecretTurnServers(),
    ...buildStaticTurnServers(),
  ];

  return {
    iceServers,
    ringTimeoutMs: Number(process.env.CALL_RING_TIMEOUT_MS || 30000),
  };
};
