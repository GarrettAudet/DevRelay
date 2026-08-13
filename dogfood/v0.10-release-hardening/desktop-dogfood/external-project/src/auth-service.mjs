import crypto from "node:crypto";

const FAILURE = Object.freeze({ ok: false, code: "INVALID_CREDENTIALS" });
const PASSWORD_KEY_BYTES = 64;
const PASSWORD_SALT_BYTES = 16;
const SCRYPT_OPTIONS = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

const derivePassword = (password, salt) =>
  crypto.scryptSync(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS);

export function createAuthService({
  users,
  sessionTtlMs = 3_600_000,
  now = Date.now,
}) {
  const records = new Map(
    users.map(({ username, password }) => {
      const salt = crypto.randomBytes(PASSWORD_SALT_BYTES);
      return [username, { salt, passwordHash: derivePassword(password, salt) }];
    }),
  );
  const dummySalt = crypto.randomBytes(PASSWORD_SALT_BYTES);
  const dummyHash = derivePassword(
    crypto.randomBytes(PASSWORD_KEY_BYTES),
    dummySalt,
  );
  const sessions = new Map();

  return {
    signIn(username, password) {
      const record = records.get(username);
      const supplied = derivePassword(password, record?.salt ?? dummySalt);
      const accepted =
        record !== undefined &&
        crypto.timingSafeEqual(record.passwordHash, supplied);
      if (!accepted) return { ...FAILURE };

      const token = crypto.randomUUID();
      const expiresAt = now() + sessionTtlMs;
      sessions.set(token, { username, expiresAt });
      return { ok: true, token, expiresAt };
    },

    authenticate(token) {
      const session = sessions.get(token);
      if (!session || session.expiresAt <= now()) {
        sessions.delete(token);
        return { ok: false, code: "INVALID_SESSION" };
      }
      return { ok: true, username: session.username };
    },

    revoke(token) {
      return sessions.delete(token);
    },
  };
}
