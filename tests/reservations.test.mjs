import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../netlify/functions/reservations.mjs";

class MemoryStore {
  value = null;
  etag = 0;

  async getWithMetadata() {
    if (!this.value) return null;
    return {
      data: structuredClone(this.value),
      etag: String(this.etag)
    };
  }

  async setJSON(_key, value, options) {
    if (options.onlyIfNew && this.value) return { modified: false };
    if (options.onlyIfMatch && options.onlyIfMatch !== String(this.etag)) {
      return { modified: false };
    }
    this.value = structuredClone(value);
    this.etag += 1;
    return { modified: true, etag: String(this.etag) };
  }
}

const makeToken = (digit) => `00000000-0000-4000-8000-${String(digit).padStart(12, "0")}`;
const post = (store, token, studentIds, companyId) => handleRequest(
  new Request("https://example.test/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, studentIds, companyId })
  }),
  store
);
const get = (store, token = "") => handleRequest(
  new Request("https://example.test/api/reservations", {
    headers: token ? { "X-Reservation-Token": token } : {}
  }),
  store
);

test("reserves unique students and companies, and permits roster edits only", async () => {
  const store = new MemoryStore();
  const firstToken = makeToken(1);
  const secondToken = makeToken(2);

  const first = await post(store, firstToken, [1, 2], 3);
  assert.equal(first.status, 200);

  const studentConflict = await post(store, secondToken, [2, 4], 4);
  assert.equal(studentConflict.status, 409);
  assert.equal((await studentConflict.json()).error, "student_unavailable");

  const companyConflict = await post(store, secondToken, [4, 5], 3);
  assert.equal(companyConflict.status, 409);
  assert.equal((await companyConflict.json()).error, "company_unavailable");

  const edited = await post(store, firstToken, [1, 4], 3);
  assert.equal(edited.status, 200);

  const changedCompany = await post(store, firstToken, [1, 4], 5);
  assert.equal(changedCompany.status, 409);
  assert.equal((await changedCompany.json()).error, "company_locked");

  const publicState = await (await get(store)).json();
  assert.deepEqual(publicState.reservedStudentIds, [1, 4]);
  assert.deepEqual(publicState.reservedCompanyIds, [3]);
  assert.equal(publicState.group, null);
  const ownState = await (await get(store, firstToken)).json();
  assert.deepEqual(ownState.group, { studentIds: [1, 4], companyId: 3 });
});

test("conditional writes prevent simultaneous claims of the same student", async () => {
  const store = new MemoryStore();
  const [left, right] = await Promise.all([
    post(store, makeToken(11), [7, 8], 1),
    post(store, makeToken(12), [8, 9], 2)
  ]);
  assert.deepEqual([left.status, right.status].sort(), [200, 409]);

  const state = await (await get(store)).json();
  assert.equal(state.reservedStudentIds.includes(8), true);
  assert.equal(state.reservedStudentIds.filter((id) => id === 8).length, 1);
});

test("rejects malformed IDs, empty groups, and unsupported methods", async () => {
  const store = new MemoryStore();
  const invalidIds = await post(store, makeToken(21), [1, 1], 1);
  assert.equal(invalidIds.status, 400);
  const emptyGroup = await post(store, makeToken(22), [], 1);
  assert.equal(emptyGroup.status, 400);
  const unsupported = await handleRequest(
    new Request("https://example.test/api/reservations", { method: "DELETE" }),
    store
  );
  assert.equal(unsupported.status, 405);
});
