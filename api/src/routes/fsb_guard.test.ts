import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { canAccessFsb, requireFsbAccess } from "./fsb_guard.js";

test("le Dashboard reste accessible à LeCasiNoze", () => {
  assert.equal(canAccessFsb({ id: 4 }), true);
});

test("les anciens membres, invités et autres admins ne peuvent plus accéder au Dashboard", () => {
  for (const user of [{ id: 15 }, { id: 71 }, { id: 15, role: "admin" }, { id: 99, role: "admin" }, null, {}]) {
    assert.equal(canAccessFsb(user), false);
    let status = 0, body: unknown, nextCalled = false;
    const response = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; } };
    requireFsbAccess({ user } as unknown as Request, response as unknown as Response, () => { nextCalled = true; });
    assert.equal(status, 403);
    assert.deepEqual(body, { ok: false, error: "forbidden" });
    assert.equal(nextCalled, false);
  }
});

test("le middleware autorise uniquement le compte propriétaire", () => {
  let nextCalled = false;
  requireFsbAccess({ user: { id: 4 } } as unknown as Request, {} as Response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
