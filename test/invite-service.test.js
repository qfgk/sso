import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { InviteService } from "../src/invite-service.js";
import { MemoryStore } from "../src/store.js";

const TEST_ACCOUNT_DOMAIN = "example.com";

function createInviteService(store) {
  return new InviteService(store, { accountDomain: TEST_ACCOUNT_DOMAIN });
}

describe("邀請碼登入規則", () => {
  it("會使用設定的帳號域名建立信箱", async () => {
    const store = new MemoryStore();
    await store.createInviteCode({ code: "JOIN-100", maxUses: 100 });
    const service = new InviteService(store, { accountDomain: "example.org" });

    const result = await service.registerWithInvite({
      account: "Alice",
      inviteCode: "JOIN-100"
    });

    assert.equal(result.email, "alice@example.org");
    await assert.rejects(
      () =>
        service.registerWithInvite({
          account: "bob@example.com",
          inviteCode: "JOIN-100"
        }),
      /只能使用 @example\.org 帳號/
    );
  });

  it("新使用者使用有效邀請碼登入時會建立帳號並消耗一次", async () => {
    const store = new MemoryStore();
    await store.createInviteCode({ code: "JOIN-100", maxUses: 100 });
    const service = createInviteService(store);

    const result = await service.registerWithInvite({
      account: "Alice",
      displayName: "Alice",
      inviteCode: "JOIN-100"
    });

    assert.equal(result.email, "alice@example.com");
    assert.equal(result.created, true);
    assert.equal((await store.getInviteCode("JOIN-100")).usedCount, 1);
  });

  it("註冊時會移除固定信箱尾綴", async () => {
    const store = new MemoryStore();
    await store.createInviteCode({ code: "JOIN-100", maxUses: 100 });
    const service = createInviteService(store);

    const result = await service.registerWithInvite({
      account: "Neko@example.com",
      inviteCode: "JOIN-100"
    });

    assert.equal(result.email, "neko@example.com");
  });

  it("註冊時會拒絕其他信箱域名", async () => {
    const store = new MemoryStore();
    await store.createInviteCode({ code: "JOIN-100", maxUses: 100 });
    const service = createInviteService(store);

    await assert.rejects(
      () =>
        service.registerWithInvite({
          account: "neko@example.org",
          inviteCode: "JOIN-100"
        }),
      /只能使用 @example\.com 帳號/
    );
  });

  it("新使用者不需要填名字並會分配固定顯示名稱", async () => {
    const store = new MemoryStore();
    await store.createInviteCode({ code: "JOIN-100", maxUses: 100 });
    const service = createInviteService(store);

    const result = await service.registerWithInvite({
      account: "name-free",
      inviteCode: "JOIN-100"
    });

    assert.equal(result.displayName, "Neko Maau");
  });

  it("邀請碼達到上限後會拒絕建立新使用者", async () => {
    const store = new MemoryStore();
    await store.createInviteCode({ code: "FULL", maxUses: 1 });
    const service = createInviteService(store);

    await service.registerWithInvite({
      account: "first",
      inviteCode: "FULL"
    });

    await assert.rejects(
      () =>
        service.registerWithInvite({
          account: "second",
          inviteCode: "FULL"
        }),
      /邀請碼使用次數已達上限/
    );
  });

  it("既有使用者登入只需要帳號且不消耗邀請碼次數", async () => {
    const store = new MemoryStore();
    await store.createInviteCode({ code: "ONCE", maxUses: 1 });
    const service = createInviteService(store);

    await service.registerWithInvite({
      account: "member",
      inviteCode: "ONCE"
    });

    const result = await service.login({
      account: "MEMBER@example.com"
    });

    assert.equal(result.email, "member@example.com");
    assert.equal(result.created, false);
    assert.equal((await store.getInviteCode("ONCE")).usedCount, 1);
  });

  it("未註冊帳號登入時會要求先註冊", async () => {
    const service = createInviteService(new MemoryStore());

    await assert.rejects(
      () =>
        service.login({
          account: "new-user"
        }),
      /帳號不存在，請先註冊/
    );
  });
});
