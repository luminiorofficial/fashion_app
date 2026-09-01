import type {Request, Response, NextFunction, RequestHandler} from "express";
import {assert} from "../utils/api-error";
import {sha256} from "../utils/crypto";
import type {UsersRepository, SessionsRepository} from "../types/repositories";

export interface AuthMiddlewareDependencies {
  users: UsersRepository;
  sessions: SessionsRepository;
}

// Express 5 forwards a rejected promise from an async middleware to the
// error-handling middleware automatically, so — matching the rest of this
// codebase — assert() failures here don't need a manual try/catch.
export function createAuthMiddleware({users, sessions}: AuthMiddlewareDependencies): RequestHandler {
  return async function authenticate(request: Request, _response: Response, next: NextFunction) {
    const header = request.get("authorization") || "";
    assert(header.startsWith("Bearer "), 401, "AUTH_REQUIRED", "Authentication is required.");
    const tokenHash = sha256(header.slice(7));
    const session = await sessions.findSession(tokenHash);
    assert(session, 401, "INVALID_SESSION", "The session is invalid or expired.");
    const user = await users.findUserById(session.userId);
    assert(user && user.status === "active", 401, "INVALID_SESSION", "The account is not active.");
    request.auth = {user, tokenHash, session};
    next();
  };
}
