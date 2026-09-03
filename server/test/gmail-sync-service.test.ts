import test from "node:test";
import assert from "node:assert/strict";
import {GmailSyncService} from "../src/commerce/gmail/gmail-sync.service";
import {ApiError} from "../src/utils/api-error";
import type {GmailConnection} from "../src/types/commerce.types";
import type {GmailApiClient} from "../src/types/provider.types";

function deferred<T = void>(): {promise: Promise<T>; resolve: (value: T) => void} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return {promise, resolve};
}

function connection(overrides: Partial<GmailConnection> = {}): GmailConnection {
  return {
    id: "conn-1", userId: "user-1", googleEmail: "shopper@gmail.com", googleAccountId: null,
    accessTokenCiphertext: "enc", accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    refreshTokenCiphertext: "enc", scope: null, status: "connected", lastSyncStatus: "idle",
    lastSyncedAt: null, lastSyncError: null, initialSyncCompletedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), disconnectedAt: null,
    ...overrides,
  };
}

function buildService(gmailClient: GmailApiClient) {
  const gmailRepo = {
    getConnectionByUserId: async () => null,
    getConnectionById: async () => null,
    upsertConnection: async () => {
      throw new Error("not used in this test");
    },
    updateConnection: async () => null,
    disconnectConnection: async () => {},
  };
  const purchaseImportsRepo = {
    upsertParsedOrder: async () => null,
    listPending: async () => [],
    getById: async () => null,
    markImported: async () => null,
    markIgnored: async () => null,
    isMessageProcessed: async () => false,
    markMessageProcessed: async () => {},
  };
  const gmailOAuth = {getValidAccessToken: async () => "access-token"};
  const parser = {getCombinedSenderQuery: () => "", parse: () => null};
  const purchaseImportService = {recordParsedOrder: async () => {}};

  return new GmailSyncService(
    gmailRepo as never,
    purchaseImportsRepo as never,
    purchaseImportService as never,
    gmailOAuth as never,
    gmailClient,
    parser as never,
    {gmailLookbackDays: 90, gmailMaxMessagesPerSyncRun: 40, gmailSyncBudgetMs: 45_000},
  );
}

test("a second concurrent syncConnection call for the same connection is rejected while the first is still running", async () => {
  const gate = deferred<void>();
  let listCalls = 0;
  const gmailClient: GmailApiClient = {
    buildAuthUrl: () => "",
    exchangeCode: async () => {
      throw new Error("not used");
    },
    refreshAccessToken: async () => {
      throw new Error("not used");
    },
    revokeToken: async () => {},
    getUserEmail: async () => "shopper@gmail.com",
    listMessageIds: async () => {
      listCalls += 1;
      await gate.promise;
      return {ids: [], nextPageToken: null};
    },
    getMessage: async () => {
      throw new Error("not used");
    },
  };

  const service = buildService(gmailClient);
  const conn = connection();

  // Calling syncConnection() synchronously marks the connection in-flight
  // (see its guard, before any await) — so a second call made without
  // awaiting the first is guaranteed to observe it, no timing games needed.
  const firstCall = service.syncConnection(conn);

  await assert.rejects(
    service.syncConnection(conn),
    (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "GMAIL_SYNC_ALREADY_IN_PROGRESS",
  );
  assert.equal(listCalls, 1, "the rejected second call must never reach the Gmail API");

  gate.resolve();
  const result = await firstCall;
  assert.equal(result.processed, 0);
});

test("a new syncConnection call is allowed once the previous one for that connection has finished", async () => {
  const gmailClient: GmailApiClient = {
    buildAuthUrl: () => "",
    exchangeCode: async () => {
      throw new Error("not used");
    },
    refreshAccessToken: async () => {
      throw new Error("not used");
    },
    revokeToken: async () => {},
    getUserEmail: async () => "shopper@gmail.com",
    listMessageIds: async () => ({ids: [], nextPageToken: null}),
    getMessage: async () => {
      throw new Error("not used");
    },
  };
  const service = buildService(gmailClient);
  const conn = connection();

  await service.syncConnection(conn);
  await assert.doesNotReject(service.syncConnection(conn));
});

test("two different connections can sync concurrently without tripping each other's guard", async () => {
  const gate = deferred<void>();
  const gmailClient: GmailApiClient = {
    buildAuthUrl: () => "",
    exchangeCode: async () => {
      throw new Error("not used");
    },
    refreshAccessToken: async () => {
      throw new Error("not used");
    },
    revokeToken: async () => {},
    getUserEmail: async () => "shopper@gmail.com",
    listMessageIds: async () => {
      await gate.promise;
      return {ids: [], nextPageToken: null};
    },
    getMessage: async () => {
      throw new Error("not used");
    },
  };
  const service = buildService(gmailClient);

  const first = service.syncConnection(connection({id: "conn-a"}));
  const second = service.syncConnection(connection({id: "conn-b"}));
  gate.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.processed, 0);
  assert.equal(secondResult.processed, 0);
});
