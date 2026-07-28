import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { ConnectionOptions } from "node:tls";
import {
  Client,
  InvalidCredentialsError,
  escapeFilter,
} from "ldapts";
import { prisma } from "@/lib/prisma";
import type {
  LdapConfigurationDTO,
  UpdateLdapConfigurationRequest,
} from "@/types";

const LDAP_CONFIGURATION_ID = 1;
const DEFAULT_TIMEOUT_MS = 5_000;
const USERNAME_PLACEHOLDER = "{{username}}";
const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_CONTEXT = Buffer.from(
  "run-insight:ldap-bind-password:v1",
  "utf8",
);

export class LdapConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LdapConfigurationError";
  }
}

export class LdapUnavailableError extends Error {
  constructor(cause: unknown) {
    super("LDAP service unavailable", { cause });
    this.name = "LdapUnavailableError";
  }
}

type LdapRuntimeConfig = {
  url: string;
  bindDn: string;
  bindPassword: string;
  searchBase: string;
  userFilter: string;
  uniqueIdAttribute: string;
  connectTimeout: number;
  operationTimeout: number;
  startTls: boolean;
  tlsOptions: ConnectionOptions;
};

export type LdapIdentity = {
  dn: string;
  externalId: string;
};

function requireBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new LdapConfigurationError(`${fieldName} 必须为布尔值`);
  }
  return value;
}

function requireString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new LdapConfigurationError(`${fieldName} 为必填项`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new LdapConfigurationError(
      `${fieldName} 长度必须为 1 到 ${maxLength} 个字符`,
    );
  }
  return normalized;
}

function requireTimeout(value: unknown, fieldName: string): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 100
    || value > 60_000
  ) {
    throw new LdapConfigurationError(
      `${fieldName} 必须为 100 到 60000 之间的整数`,
    );
  }
  return value;
}

export function parseLdapConfigurationInput(
  value: unknown,
): UpdateLdapConfigurationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LdapConfigurationError("LDAP 配置必须是 JSON 对象");
  }
  const input = value as Record<string, unknown>;
  const urlValue = requireString(input.url, "LDAP 地址", 512);
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new LdapConfigurationError("LDAP 地址格式无效");
  }
  if (!["ldap:", "ldaps:"].includes(url.protocol)) {
    throw new LdapConfigurationError(
      "LDAP 地址必须使用 ldap:// 或 ldaps:// 协议",
    );
  }
  if (
    !url.hostname
    || url.username
    || url.password
    || (url.pathname && url.pathname !== "/")
    || url.search
    || url.hash
  ) {
    throw new LdapConfigurationError(
      "LDAP 地址只能包含协议、主机名和端口",
    );
  }

  const userFilter = requireString(input.userFilter, "用户过滤器", 1024);
  if (!userFilter.includes(USERNAME_PLACEHOLDER)) {
    throw new LdapConfigurationError(
      `用户过滤器必须包含 ${USERNAME_PLACEHOLDER}`,
    );
  }
  const uniqueIdAttribute = requireString(
    input.uniqueIdAttribute,
    "唯一标识属性",
    191,
  );
  if (!/^[a-z][a-z0-9-]*$/i.test(uniqueIdAttribute)) {
    throw new LdapConfigurationError("唯一标识属性名称无效");
  }

  const startTls = requireBoolean(input.startTls, "StartTLS");
  const allowInsecure = requireBoolean(
    input.allowInsecure,
    "允许不安全连接",
  );
  if (url.protocol === "ldap:" && !startTls && !allowInsecure) {
    throw new LdapConfigurationError(
      "ldap:// 必须启用 StartTLS；如仅用于开发测试，可显式允许不安全连接",
    );
  }

  let bindPassword: string | undefined;
  if (input.bindPassword !== undefined && input.bindPassword !== "") {
    if (
      typeof input.bindPassword !== "string"
      || input.bindPassword.length > 4096
    ) {
      throw new LdapConfigurationError(
        "绑定密码长度必须为 1 到 4096 个字符",
      );
    }
    bindPassword = input.bindPassword;
  }

  let tlsCaCertificate: string | undefined;
  if (
    input.tlsCaCertificate !== undefined
    && input.tlsCaCertificate !== null
    && input.tlsCaCertificate !== ""
  ) {
    if (
      typeof input.tlsCaCertificate !== "string"
      || input.tlsCaCertificate.length > 65_535
    ) {
      throw new LdapConfigurationError(
        "CA 证书长度不能超过 65535 个字符",
      );
    }
    tlsCaCertificate = input.tlsCaCertificate.trim();
  }

  return {
    enabled: requireBoolean(input.enabled, "启用状态"),
    url: urlValue,
    bindDn: requireString(input.bindDn, "绑定 DN", 512),
    ...(bindPassword ? { bindPassword } : {}),
    searchBase: requireString(input.searchBase, "搜索 Base DN", 512),
    userFilter,
    uniqueIdAttribute,
    startTls,
    tlsRejectUnauthorized: requireBoolean(
      input.tlsRejectUnauthorized,
      "TLS 证书校验",
    ),
    ...(tlsCaCertificate ? { tlsCaCertificate } : {}),
    connectTimeoutMs: requireTimeout(
      input.connectTimeoutMs,
      "连接超时",
    ),
    operationTimeoutMs: requireTimeout(
      input.operationTimeoutMs,
      "操作超时",
    ),
    allowInsecure,
  };
}

function decodeEncryptionKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new LdapConfigurationError("LDAP 加密密钥数据无效");
  }
  return key;
}

export function encryptLdapBindPassword(
  password: string,
  encodedKey: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    decodeEncryptionKey(encodedKey),
    iv,
  );
  cipher.setAAD(ENCRYPTION_CONTEXT);
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptLdapBindPassword(
  ciphertext: string,
  encodedKey: string,
): string {
  const [version, ivValue, tagValue, encryptedValue, extra] =
    ciphertext.split(".");
  if (
    version !== ENCRYPTION_VERSION
    || !ivValue
    || !tagValue
    || !encryptedValue
    || extra
  ) {
    throw new LdapConfigurationError("LDAP 绑定密码密文无效");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      decodeEncryptionKey(encodedKey),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(ENCRYPTION_CONTEXT);
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new LdapConfigurationError("LDAP 绑定密码密文无效");
  }
}

function defaultPublicConfiguration(): LdapConfigurationDTO {
  return {
    enabled: false,
    url: "ldap://ldap.example.com:389",
    bindDn: "",
    passwordConfigured: false,
    searchBase: "",
    userFilter: `(uid=${USERNAME_PLACEHOLDER})`,
    uniqueIdAttribute: "entryUUID",
    startTls: true,
    tlsRejectUnauthorized: true,
    tlsCaCertificate: "",
    connectTimeoutMs: DEFAULT_TIMEOUT_MS,
    operationTimeoutMs: DEFAULT_TIMEOUT_MS,
    allowInsecure: false,
    updatedAt: null,
  };
}

function toPublicConfiguration(configuration: {
  enabled: boolean;
  url: string;
  bindDn: string;
  bindPasswordCiphertext: string;
  searchBase: string;
  userFilter: string;
  uniqueIdAttribute: string;
  startTls: boolean;
  tlsRejectUnauthorized: boolean;
  tlsCaCertificate: string | null;
  connectTimeoutMs: number;
  operationTimeoutMs: number;
  allowInsecure: boolean;
  updatedAt: Date;
}): LdapConfigurationDTO {
  return {
    enabled: configuration.enabled,
    url: configuration.url,
    bindDn: configuration.bindDn,
    passwordConfigured: Boolean(configuration.bindPasswordCiphertext),
    searchBase: configuration.searchBase,
    userFilter: configuration.userFilter,
    uniqueIdAttribute: configuration.uniqueIdAttribute,
    startTls: configuration.startTls,
    tlsRejectUnauthorized: configuration.tlsRejectUnauthorized,
    tlsCaCertificate: configuration.tlsCaCertificate ?? "",
    connectTimeoutMs: configuration.connectTimeoutMs,
    operationTimeoutMs: configuration.operationTimeoutMs,
    allowInsecure: configuration.allowInsecure,
    updatedAt: configuration.updatedAt.toISOString(),
  };
}

export async function getLdapConfiguration(): Promise<LdapConfigurationDTO> {
  const configuration = await prisma.ldapConfiguration.findUnique({
    where: { id: LDAP_CONFIGURATION_ID },
  });
  return configuration
    ? toPublicConfiguration(configuration)
    : defaultPublicConfiguration();
}

export async function saveLdapConfiguration(
  input: UpdateLdapConfigurationRequest,
): Promise<LdapConfigurationDTO> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.ldapConfiguration.findUnique({
      where: { id: LDAP_CONFIGURATION_ID },
    });
    const encryptionKey =
      existing?.encryptionKey ?? randomBytes(32).toString("base64");
    const bindPasswordCiphertext = input.bindPassword
      ? encryptLdapBindPassword(input.bindPassword, encryptionKey)
      : existing?.bindPasswordCiphertext;
    if (!bindPasswordCiphertext) {
      throw new LdapConfigurationError("首次保存时必须填写绑定密码");
    }

    const data = {
      enabled: input.enabled,
      url: input.url,
      bindDn: input.bindDn,
      bindPasswordCiphertext,
      encryptionKey,
      searchBase: input.searchBase,
      userFilter: input.userFilter,
      uniqueIdAttribute: input.uniqueIdAttribute,
      startTls: input.startTls,
      tlsRejectUnauthorized: input.tlsRejectUnauthorized,
      tlsCaCertificate: input.tlsCaCertificate || null,
      connectTimeoutMs: input.connectTimeoutMs,
      operationTimeoutMs: input.operationTimeoutMs,
      allowInsecure: input.allowInsecure,
    };
    const saved = existing
      ? await tx.ldapConfiguration.update({
          where: { id: LDAP_CONFIGURATION_ID },
          data,
        })
      : await tx.ldapConfiguration.create({
          data: { id: LDAP_CONFIGURATION_ID, ...data },
        });
    return toPublicConfiguration(saved);
  });
}

async function resolveRuntimeConfiguration(
  input?: UpdateLdapConfigurationRequest,
): Promise<LdapRuntimeConfig | null> {
  const stored = await prisma.ldapConfiguration.findUnique({
    where: { id: LDAP_CONFIGURATION_ID },
  });
  if (!input && (!stored || !stored.enabled)) return null;

  const settings = input ?? stored;
  if (!settings) {
    throw new LdapConfigurationError(
      "请先保存 LDAP 配置和绑定密码",
    );
  }
  const bindPassword =
    input?.bindPassword
    ?? (stored
      ? decryptLdapBindPassword(
          stored.bindPasswordCiphertext,
          stored.encryptionKey,
        )
      : null);
  if (!bindPassword) {
    throw new LdapConfigurationError(
      "测试前请填写绑定密码，或先保存已有绑定密码",
    );
  }
  let parsed: UpdateLdapConfigurationRequest;
  if (input) {
    parsed = input;
  } else {
    if (!stored) {
      throw new LdapConfigurationError("请先保存 LDAP 配置和绑定密码");
    }
    parsed = {
      enabled: stored.enabled,
      url: stored.url,
      bindDn: stored.bindDn,
      searchBase: stored.searchBase,
      userFilter: stored.userFilter,
      uniqueIdAttribute: stored.uniqueIdAttribute,
      startTls: stored.startTls,
      tlsRejectUnauthorized: stored.tlsRejectUnauthorized,
      tlsCaCertificate: stored.tlsCaCertificate ?? undefined,
      connectTimeoutMs: stored.connectTimeoutMs,
      operationTimeoutMs: stored.operationTimeoutMs,
      allowInsecure: stored.allowInsecure,
    };
  }

  return {
    url: parsed.url,
    bindDn: parsed.bindDn,
    bindPassword,
    searchBase: parsed.searchBase,
    userFilter: parsed.userFilter,
    uniqueIdAttribute: parsed.uniqueIdAttribute,
    connectTimeout: parsed.connectTimeoutMs,
    operationTimeout: parsed.operationTimeoutMs,
    startTls:
      parsed.url.startsWith("ldap://")
      && parsed.startTls,
    tlsOptions: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: parsed.tlsRejectUnauthorized,
      ...(parsed.tlsCaCertificate
        ? { ca: [Buffer.from(parsed.tlsCaCertificate, "utf8")] }
        : {}),
    },
  };
}

function buildUserFilter(template: string, username: string): string {
  const escapedUsername = escapeFilter`${username}`;
  return template.replaceAll(USERNAME_PLACEHOLDER, escapedUsername);
}

function identityHash(attribute: string, value: Buffer | string): string {
  return createHash("sha256")
    .update(attribute.toLowerCase())
    .update("\0")
    .update(value)
    .digest("hex");
}

function readAttribute(
  entry: Record<string, Buffer | Buffer[] | string | string[]>,
  attribute: string,
): Buffer | string | null {
  const matched = Object.entries(entry).find(
    ([key]) => key.toLowerCase() === attribute.toLowerCase(),
  )?.[1];
  if (Buffer.isBuffer(matched) || typeof matched === "string") return matched;
  if (Array.isArray(matched)) {
    const first = matched[0];
    return Buffer.isBuffer(first) || typeof first === "string" ? first : null;
  }
  return null;
}

async function authenticateWithConfiguration(
  config: LdapRuntimeConfig,
  username: string,
  password: string,
): Promise<LdapIdentity | null> {
  const client = new Client({
    url: config.url,
    connectTimeout: config.connectTimeout,
    timeout: config.operationTimeout,
    ...(config.url.startsWith("ldaps://")
      ? { tlsOptions: config.tlsOptions }
      : {}),
  });
  let userBindAttempted = false;

  try {
    if (config.startTls) {
      await client.startTLS(config.tlsOptions);
    }
    await client.bind(config.bindDn, config.bindPassword);

    const { searchEntries } = await client.search(config.searchBase, {
      scope: "sub",
      filter: buildUserFilter(config.userFilter, username),
      attributes: [config.uniqueIdAttribute],
      explicitBufferAttributes: [config.uniqueIdAttribute],
      sizeLimit: 2,
      timeLimit: Math.max(1, Math.ceil(config.operationTimeout / 1_000)),
    });
    if (searchEntries.length !== 1) return null;

    const dn = searchEntries[0]?.dn;
    if (!dn) return null;
    const uniqueId = readAttribute(
      searchEntries[0],
      config.uniqueIdAttribute,
    );
    const externalId = uniqueId
      ? identityHash(config.uniqueIdAttribute, uniqueId)
      : identityHash("dn", dn.normalize("NFKC").toLowerCase());

    userBindAttempted = true;
    await client.bind(dn, password);
    return { dn, externalId };
  } catch (error) {
    if (error instanceof InvalidCredentialsError && userBindAttempted) {
      return null;
    }
    if (error instanceof LdapConfigurationError) throw error;
    throw new LdapUnavailableError(error);
  } finally {
    try {
      await client.unbind();
    } catch {
      // The connection may already be closed after a failed bind.
    }
  }
}

function normalizeTestCredential(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new LdapConfigurationError(`${fieldName} 为必填项`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throw new LdapConfigurationError(`${fieldName} 包含无效字符`);
  }
  if (fieldName !== "测试用户名") return value;
  const username = value.normalize("NFKC").trim();
  if (!username) {
    throw new LdapConfigurationError("测试用户名为必填项");
  }
  return username;
}

export async function testLdapConfiguration(
  input: UpdateLdapConfigurationRequest,
  testUsername: unknown,
  testPassword: unknown,
): Promise<boolean> {
  const config = await resolveRuntimeConfiguration(input);
  if (!config) return false;
  const username = normalizeTestCredential(
    testUsername,
    "测试用户名",
    191,
  );
  const password = normalizeTestCredential(testPassword, "测试密码", 4096);
  return Boolean(
    await authenticateWithConfiguration(config, username, password),
  );
}

export async function authenticateLdapUser(
  username: string,
  password: string,
): Promise<LdapIdentity | null> {
  if (!password) return null;
  const config = await resolveRuntimeConfiguration();
  if (!config) return null;
  return authenticateWithConfiguration(config, username, password);
}
