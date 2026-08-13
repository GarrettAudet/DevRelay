# Authentication service operations

- The service is in-memory and is restarted to clear all sessions.
- Never log passwords, stored password digests, or session tokens.
- Monitor invalid-credential rates without recording supplied credentials.
- Treat repeated invalid sessions as an operational signal, not proof of user identity.
- Roll back by restoring the prior immutable application commit and restarting the process.
