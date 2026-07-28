import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { ConnectionOptions } from "node:tls";
import {
  Client,
  InvalidCredentialsError,
  escapeFilter,
} from "ldapts";

const DEFAULT_TIMEOUT_MS = 5_000;
const USERNAME_PLACEHOLDER = "{{username}}";

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

type LdapConfig = {
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

function parseBoolean(
  name: string,
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === "") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new LdapConfigurationError(`${name} must be true or false`);
}

function parseTimeout(name: string, value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 60_000) {
    throw new LdapConfigurationError(
      `${name} must be an integer between 100 and 60000`,
    );
  }
  return parsed;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new LdapConfigurationError(`${name} is required when LDAP is enabled`);
  }
  return value;
}

export function isLdapEnabled(): boolean {
  return parseBoolean("LDAP_ENABLED", process.env.LDAP_ENABLED, false);
}

function getLdapConfig(): LdapConfig | null {
  if (!isLdapEnabled()) return null;

  const urlValue = required("LDAP_URL");
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new LdapConfigurationError("LDAP_URL must be a valid LDAP URL");
  }
  if (!["ldap:", "ldaps:"].includes(url.protocol)) {
    throw new LdapConfigurationError(
      "LDAP_URL must use the ldap:// or ldaps:// protocol",
    );
  }
  if (
    url.username
    || url.password
    || (url.pathname && url.pathname !== "/")
    || url.search
    || url.hash
  ) {
    throw new LdapConfigurationError(
      "LDAP_URL may only contain protocol, host, and port",
    );
  }

  const userFilter =
    process.env.LDAP_USER_FILTER?.trim() || `(uid=${USERNAME_PLACEHOLDER})`;
  if (!userFilter.includes(USERNAME_PLACEHOLDER)) {
    throw new LdapConfigurationError(
      `LDAP_USER_FILTER must contain ${USERNAME_PLACEHOLDER}`,
    );
  }
  const uniqueIdAttribute =
    process.env.LDAP_UNIQUE_ID_ATTRIBUTE?.trim() || "entryUUID";
  if (!/^[a-z][a-z0-9-]*$/i.test(uniqueIdAttribute)) {
    throw new LdapConfigurationError(
      "LDAP_UNIQUE_ID_ATTRIBUTE must be a valid LDAP attribute name",
    );
  }

  const rejectUnauthorized = parseBoolean(
    "LDAP_TLS_REJECT_UNAUTHORIZED",
    process.env.LDAP_TLS_REJECT_UNAUTHORIZED,
    true,
  );
  const allowInsecure = parseBoolean(
    "LDAP_ALLOW_INSECURE",
    process.env.LDAP_ALLOW_INSECURE,
    false,
  );
  const startTls =
    url.protocol === "ldap:"
    && parseBoolean("LDAP_START_TLS", process.env.LDAP_START_TLS, true);
  if (url.protocol === "ldap:" && !startTls && !allowInsecure) {
    throw new LdapConfigurationError(
      "Plain LDAP simple bind is disabled; enable LDAP_START_TLS or explicitly set LDAP_ALLOW_INSECURE=true",
    );
  }

  const caFile = process.env.LDAP_TLS_CA_FILE?.trim();
  let ca: Buffer[] | undefined;
  if (caFile) {
    try {
      ca = [readFileSync(caFile)];
    } catch (error) {
      throw new LdapConfigurationError(
        `Unable to read LDAP_TLS_CA_FILE: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  return {
    url: urlValue,
    bindDn: required("LDAP_BIND_DN"),
    bindPassword: required("LDAP_BIND_PASSWORD"),
    searchBase: required("LDAP_SEARCH_BASE"),
    userFilter,
    uniqueIdAttribute,
    connectTimeout: parseTimeout(
      "LDAP_CONNECT_TIMEOUT_MS",
      process.env.LDAP_CONNECT_TIMEOUT_MS,
    ),
    operationTimeout: parseTimeout(
      "LDAP_OPERATION_TIMEOUT_MS",
      process.env.LDAP_OPERATION_TIMEOUT_MS,
    ),
    startTls,
    tlsOptions: {
      minVersion: "TLSv1.2",
      rejectUnauthorized,
      ...(ca ? { ca } : {}),
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

export async function authenticateLdapUser(
  username: string,
  password: string,
): Promise<LdapIdentity | null> {
  const config = getLdapConfig();
  if (!config || !password) return null;

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
