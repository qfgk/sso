import { normalizeEmail, normalizeInviteCode } from "./store.js";

export class InviteService {
  constructor(store, { accountDomain } = {}) {
    this.store = store;
    this.accountDomain = normalizeAccountDomain(accountDomain);
  }

  async login({ account }) {
    const normalizedEmail = normalizeAccountEmail(account, this.accountDomain);
    const existingUser = await this.store.getUserByEmail(normalizedEmail);
    if (!existingUser) {
      throw new Error("帳號不存在，請先註冊");
    }

    const user = await this.store.updateUserLogin(normalizedEmail);
    return { ...user, created: false };
  }

  async registerWithInvite({ account, displayName, inviteCode }) {
    const normalizedEmail = normalizeAccountEmail(account, this.accountDomain);
    const existingUser = await this.store.getUserByEmail(normalizedEmail);
    if (existingUser) {
      const user = await this.store.updateUserLogin(normalizedEmail);
      return { ...user, created: false };
    }
    normalizeInviteCode(inviteCode);
    const result = await this.store.createUserWithInvite({
      email: normalizedEmail,
      displayName,
      inviteCode
    });
    return { ...result.user, created: result.created };
  }

  async loginWithInvite({ email, displayName, inviteCode }) {
    return this.registerWithInvite({ account: email, displayName, inviteCode });
  }
}

export function normalizeAccountEmail(account, accountDomain) {
  const normalizedDomain = normalizeAccountDomain(accountDomain);
  const normalized = String(account ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("請輸入帳號");
  }
  if (normalized.includes("@")) {
    if (!normalized.endsWith(`@${normalizedDomain}`)) {
      throw new Error(`只能使用 @${normalizedDomain} 帳號`);
    }
    return normalizeEmail(normalized);
  }
  if (!/^[a-z0-9._+-]+$/.test(normalized)) {
    throw new Error("帳號只能包含英文字母、數字、點、底線、加號與連字號");
  }
  return normalizeEmail(`${normalized}@${normalizedDomain}`);
}

function normalizeAccountDomain(accountDomain) {
  const normalized = String(accountDomain ?? "").trim().toLowerCase().replace(/^@+/, "").replace(/\.+$/, "");
  if (!normalized) {
    throw new Error("缺少必要設定：ACCOUNT_DOMAIN");
  }
  return normalized;
}
