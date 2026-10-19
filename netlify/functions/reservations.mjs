import { getStore } from "@netlify/blobs";

const STORE_NAME = "agroinvest-reservations";
const STATE_KEY = "reservations-v1";
const VALID_STUDENT_IDS = new Set(Array.from({ length: 17 }, (_, index) => index + 1));
const VALID_COMPANY_IDS = new Set(Array.from({ length: 8 }, (_, index) => index + 1));
const MAX_CAS_ATTEMPTS = 10;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function validToken(token) {
  return typeof token === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

function normalizeIds(values, allowed) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (values.some((value) => !Number.isInteger(value) || !allowed.has(value))) return null;
  const ids = [...new Set(values)].sort((left, right) => left - right);
  return ids.length === values.length ? ids : null;
}

function availability(state, token = "") {
  const groups = Object.entries(state.groups);
  const ownGroup = token ? state.groups[token] || null : null;
  const ownedByOthers = groups.filter(([key]) => key !== token).map(([, group]) => group);
  return {
    reservedStudentIds: [...new Set(ownedByOthers.flatMap((group) => group.studentIds))],
    reservedCompanyIds: [...new Set(ownedByOthers.map((group) => group.companyId))],
    group: ownGroup
      ? { studentIds: ownGroup.studentIds, companyId: ownGroup.companyId }
      : null
  };
}

async function readState(store) {
  const entry = await store.getWithMetadata(STATE_KEY, {
    type: "json",
    consistency: "strong"
  });
  if (!entry) return { state: { version: 1, groups: {} }, etag: null };
  return {
    state: entry.data || { version: 1, groups: {} },
    etag: entry.etag
  };
}

async function writeState(store, state, etag) {
  return store.setJSON(STATE_KEY, state, etag
    ? { onlyIfMatch: etag }
    : { onlyIfNew: true });
}

async function reserveGroup(store, requestData) {
  if (!requestData || typeof requestData !== "object" || Array.isArray(requestData)) {
    return { response: jsonResponse({ error: "invalid_selection" }, 400) };
  }
  const { token, studentIds: rawStudentIds, companyId } = requestData;
  if (!validToken(token)) {
    return { response: jsonResponse({ error: "invalid_token" }, 400) };
  }
  const studentIds = normalizeIds(rawStudentIds, VALID_STUDENT_IDS);
  if (!studentIds || !Number.isInteger(companyId) || !VALID_COMPANY_IDS.has(companyId)) {
    return { response: jsonResponse({ error: "invalid_selection" }, 400) };
  }

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const { state, etag } = await readState(store);
    const currentGroup = state.groups[token];
    if (currentGroup && currentGroup.companyId !== companyId) {
      return { response: jsonResponse({ error: "company_locked" }, 409) };
    }

    const groups = Object.entries(state.groups);
    const studentConflict = groups.some(([groupToken, group]) =>
      groupToken !== token && group.studentIds.some((id) => studentIds.includes(id))
    );
    if (studentConflict) {
      return { response: jsonResponse({ error: "student_unavailable" }, 409) };
    }
    const companyConflict = groups.some(([groupToken, group]) =>
      groupToken !== token && group.companyId === companyId
    );
    if (companyConflict) {
      return { response: jsonResponse({ error: "company_unavailable" }, 409) };
    }

    const now = new Date().toISOString();
    const updatedState = {
      ...state,
      version: 1,
      groups: {
        ...state.groups,
        [token]: {
          studentIds,
          companyId,
          createdAt: currentGroup?.createdAt || now,
          updatedAt: now
        }
      }
    };
    const result = await writeState(store, updatedState, etag);
    if (result.modified) {
      return {
        response: jsonResponse({
          ...availability(updatedState, token),
          group: { studentIds, companyId }
        })
      };
    }
  }

  return { response: jsonResponse({ error: "reservation_busy" }, 503) };
}

export async function handleRequest(request, store) {
  if (request.method === "GET") {
    const token = request.headers.get("x-reservation-token") || "";
    if (token && !validToken(token)) {
      return jsonResponse({ error: "invalid_token" }, 400);
    }
    const { state } = await readState(store);
    return jsonResponse(availability(state, token));
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let requestData;
  try {
    requestData = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  return (await reserveGroup(store, requestData)).response;
}

export default async (request) => {
  try {
    return await handleRequest(request, getStore(STORE_NAME));
  } catch (error) {
    console.error("Falha ao consultar ou atualizar reservas AgroInvest.", error);
    return jsonResponse({ error: "reservation_service_unavailable" }, 500);
  }
};
