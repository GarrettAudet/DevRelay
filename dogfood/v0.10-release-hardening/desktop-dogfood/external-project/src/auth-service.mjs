import crypto from "node:crypto";

const FAILURE = Object.freeze({ ok: false, code: "INVALID_CREDENTIALS" });

const timingSafeTextEqual = (left, right) => {
  const leftDigest = crypto.createHash("sha256").update(left).digest();
  const rightDigest = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

export function createAuthService({ users, sessionTtlMs = 3_600_000, now = Date.now }) {
  const records = new Map(
    users.map(({ username, password }) => [
      username,
      crypto.createHash("sha256").update(password).digest("hex"),
    ]),
  );
  const sessions = new Map();

  return {
    signIn(username, password) {
      const stored = records.get(username);
      const supplied = crypto.createHash("sha256").update(password).digest("hex");
      const accepted = stored !== undefined && timingSafeTextEqual(stored, supplied);
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
