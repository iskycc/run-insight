import { createHash } from "node:crypto";
import {
  Client,
  InvalidCredentialsError,
} from "ldapts";
import {
  LdapConfigurationError,
  LdapUnavailableError,
  authenticateLdapUser,
} from "@/lib/ldap";

jest.mock("ldapts", () => {
  const actual = jest.requireActual("ldapts");
  return {
    ...actual,
    Client: jest.fn(),
  };
});

const LDAP_ENV_KEYS = [
  "LDAP_ENABLED",
  "LDAP_URL",
  "LDAP_BIND_DN",
  "LDAP_BIND_PASSWORD",
  "LDAP_SEARCH_BASE",
  "LDAP_USER_FILTER",
  "LDAP_UNIQUE_ID_ATTRIBUTE",
  "LDAP_START_TLS",
  "LDAP_TLS_REJECT_UNAUTHORIZED",
  "LDAP_TLS_CA_FILE",
  "LDAP_CONNECT_TIMEOUT_MS",
  "LDAP_OPERATION_TIMEOUT_MS",
  "LDAP_ALLOW_INSECURE",
] as const;

const originalEnvironment = Object.fromEntries(
  LDAP_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function configureLdap(overrides: Record<string, string> = {}) {
  Object.assign(process.env, {
    LDAP_ENABLED: "true",
    LDAP_URL: "ldaps://ldap.example.com:636",
    LDAP_BIND_DN: "cn=service,dc=example,dc=com",
    LDAP_BIND_PASSWORD: "service-password",
    LDAP_SEARCH_BASE: "ou=people,dc=example,dc=com",
    LDAP_USER_FILTER: "(&(objectClass=person)(uid={{username}}))",
    LDAP_UNIQUE_ID_ATTRIBUTE: "entryUUID",
    LDAP_TLS_REJECT_UNAUTHORIZED: "true",
    LDAP_CONNECT_TIMEOUT_MS: "3000",
    LDAP_OPERATION_TIMEOUT_MS: "4000",
    LDAP_ALLOW_INSECURE: "false",
    ...overrides,
  });
}

function createClientMock() {
  return {
    startTLS: jest.fn().mockResolvedValue(undefined),
    bind: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue({
      searchEntries: [
        {
          dn: "uid=alice,ou=people,dc=example,dc=com",
          entryUUID: Buffer.from("directory-id"),
        },
      ],
    }),
    unbind: jest.fn().mockResolvedValue(undefined),
  };
}

describe("LDAP authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of LDAP_ENV_KEYS) delete process.env[key];
  });

  afterAll(() => {
    for (const key of LDAP_ENV_KEYS) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not create a client when LDAP is disabled", async () => {
    await expect(authenticateLdapUser("alice", "password")).resolves.toBeNull();
    expect(Client).not.toHaveBeenCalled();
  });

  it("searches with an RFC 4515 escaped username and binds as the user", async () => {
    configureLdap();
    const client = createClientMock();
    (Client as jest.Mock).mockImplementation(() => client);

    const identity = await authenticateLdapUser(
      "alice*)(uid=*)",
      "user-password",
    );

    expect(client.bind).toHaveBeenNthCalledWith(
      1,
      "cn=service,dc=example,dc=com",
      "service-password",
    );
    expect(client.search).toHaveBeenCalledWith(
      "ou=people,dc=example,dc=com",
      expect.objectContaining({
        scope: "sub",
        filter: "(&(objectClass=person)(uid=alice\\2a\\29\\28uid=\\2a\\29))",
        attributes: ["entryUUID"],
        explicitBufferAttributes: ["entryUUID"],
        sizeLimit: 2,
      }),
    );
    expect(client.bind).toHaveBeenNthCalledWith(
      2,
      "uid=alice,ou=people,dc=example,dc=com",
      "user-password",
    );
    expect(identity).toEqual({
      dn: "uid=alice,ou=people,dc=example,dc=com",
      externalId: createHash("sha256")
        .update("entryuuid")
        .update("\0")
        .update(Buffer.from("directory-id"))
        .digest("hex"),
    });
    expect(client.unbind).toHaveBeenCalledTimes(1);
  });

  it("uses StartTLS before binding for ldap:// connections", async () => {
    configureLdap({
      LDAP_URL: "ldap://ldap.example.com:389",
      LDAP_START_TLS: "true",
    });
    const client = createClientMock();
    (Client as jest.Mock).mockImplementation(() => client);

    await authenticateLdapUser("alice", "user-password");

    expect(client.startTLS).toHaveBeenCalledWith(
      expect.objectContaining({
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      }),
    );
    expect(client.startTLS.mock.invocationCallOrder[0]).toBeLessThan(
      client.bind.mock.invocationCallOrder[0],
    );
  });

  it("rejects an insecure simple-bind configuration by default", async () => {
    configureLdap({
      LDAP_URL: "ldap://ldap.example.com:389",
      LDAP_START_TLS: "false",
    });

    await expect(
      authenticateLdapUser("alice", "password"),
    ).rejects.toBeInstanceOf(LdapConfigurationError);
    expect(Client).not.toHaveBeenCalled();
  });

  it("maps invalid user credentials to an authentication miss", async () => {
    configureLdap();
    const client = createClientMock();
    client.bind
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new InvalidCredentialsError());
    (Client as jest.Mock).mockImplementation(() => client);

    await expect(
      authenticateLdapUser("alice", "wrong-password"),
    ).resolves.toBeNull();
    expect(client.unbind).toHaveBeenCalledTimes(1);
  });

  it("treats invalid service-account credentials as an unavailable directory", async () => {
    configureLdap();
    const client = createClientMock();
    client.bind.mockRejectedValueOnce(new InvalidCredentialsError());
    (Client as jest.Mock).mockImplementation(() => client);

    await expect(
      authenticateLdapUser("alice", "user-password"),
    ).rejects.toBeInstanceOf(LdapUnavailableError);
    expect(client.search).not.toHaveBeenCalled();
  });

  it("wraps connection failures without exposing credentials", async () => {
    configureLdap();
    const client = createClientMock();
    client.bind.mockRejectedValueOnce(new Error("connection refused"));
    (Client as jest.Mock).mockImplementation(() => client);

    await expect(
      authenticateLdapUser("alice", "secret-password"),
    ).rejects.toBeInstanceOf(LdapUnavailableError);
  });
});
