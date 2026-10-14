import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../db.js";
import { hashPassword } from "../auth.js";
import { accountActionsRouter } from "./account_actions.js";

test("rename transaction preserves identity and verification semantics", async (t) => {
  const route = (accountActionsRouter as any).stack.find((layer: any) => layer.route?.path === "/me/rename/confirm").route;
  const handler = route.stack.at(-1).handle;
  const codeHash = await hashPassword("123456");
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "rename-test-secret";
  try {
    for (const scenario of ["success", "bad_code", "taken"] as const) {
      await t.test(scenario, async (st) => {
        const queries: string[] = [];
        const client = {
          async query(sql: string) {
            queries.push(sql);
            if (sql.includes("FROM account_action_codes")) return { rows: [{ id: 9, code_hash: codeHash, attempts: 0, expires_at: new Date(Date.now() + 60000) }] };
            if (sql.includes("FOR UPDATE") && sql.includes("FROM users")) return { rows: [{ username: "old", last_rename_at: null }] };
            if (sql.includes("SET username=")) {
              if (scenario === "taken") throw Object.assign(new Error("duplicate"), { code: "23505" });
            }
            if (sql.includes("SELECT id, username, rubis, role")) return { rows: [{ id: 4, username: "new", rubis: 50, role: "viewer" }] };
            return { rows: [] };
          },
          release() {},
        };
        st.mock.method(pool, "query", async () => ({ rows: [] }));
        st.mock.method(pool, "connect", async () => client);
        const response = await new Promise<{ status: number; body: any }>((resolve, reject) => {
          let status = 200;
          handler({ user: { id: 4 }, body: { newUsername: "new", code: scenario === "bad_code" ? "000000" : "123456" } }, {
            status(value: number) { status = value; return this; },
            json(body: any) { resolve({ status, body }); },
          }, reject);
        });
        assert.ok(queries.some(sql => sql.includes("FROM users") && sql.includes("FOR UPDATE")));
        if (scenario === "success") {
          assert.equal(response.status, 200); assert.equal(response.body.user.username, "new");
          assert.ok(response.body.token); assert.ok(queries.includes("COMMIT"));
          assert.ok(queries.some(sql => sql.includes("UPDATE streamers")));
        } else if (scenario === "bad_code") {
          assert.equal(response.body.error, "bad_code");
          assert.ok(queries.some(sql => sql.includes("attempts=attempts+1")));
          assert.ok(queries.includes("COMMIT")); assert.ok(!queries.includes("ROLLBACK"));
        } else {
          assert.equal(response.status, 409); assert.equal(response.body.error, "username_taken");
          assert.ok(queries.includes("ROLLBACK"));
        }
      });
    }
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
