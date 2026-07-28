import { createHash } from "node:crypto";
import {
  Client,
  InvalidCredentialsError,
} from "ldapts";
import { prisma } from "@/lib/prisma";
import {
  LdapConfigurationError,
  LdapUnavailableError,
  authenticateLdapUser,
  decryptLdapBindPassword,
  encryptLdapBindPassword,
  getLdapConfiguration,
  parseLdapConfigurationInput,
  saveLdapConfiguration,
  testLdapConfiguration,
} from "@/lib/ldap";
import type { UpdateLdapConfigurationRequest } from "@/types";

jest.mock("@/lib/prisma", () => {
  const ldapConfiguration = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  return {
    prisma: {
      ldapConfiguration,
      $transaction: jest.fn(
        async (
          callback: (tx: { ldapConfiguration: typeof ldapConfiguration }) => Promise<unknown>,
        ) => callback({ ldapConfiguration }),
      ),
    },
  };
});

jest.mock("ldapts", () => {
  const actual = jest.requireActual("ldapts");
  return {
    ...actual,
    Client: jest.fn(),
  };
});

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const encryptionKey = Buffer.alloc(32, 7).toString("base64");

const validInput: UpdateLdapConfigurationRequest = {
  enabled: true,
  url: "ldaps://ldap.example.com:636",
  bindDn: "cn=service,dc=example,dc=com",
  bindPassword: "service-password",
  searchBase: "ou=people,dc=example,dc=com",
  userFilter: "(&(objectClass=person)(uid={{username}}))",
  uniqueIdAttribute: "entryUUID",
  startTls: true,
  tlsRejectUnauthorized: true,
  tlsCaCertificate: "",
  connectTimeoutMs: 3000,
  operationTimeoutMs: 4000,
  allowInsecure: false,
};

function storedConfiguration(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 1,
    enabled: true,
    url: validInput.url,
    bindDn: validInput.bindDn,
    bindPasswordCiphertext: encryptLdapBindPassword(
      "service-password",
      encryptionKey,
    ),
    encryptionKey,
    searchBase: validInput.searchBase,
    userFilter: validInput.userFilter,
    uniqueIdAttribute: validInput.uniqueIdAttribute,
    startTls: validInput.startTls,
    tlsRejectUnauthorized: validInput.tlsRejectUnauthorized,
    tlsCaCertificate: null,
    connectTimeoutMs: validInput.connectTimeoutMs,
    operationTimeoutMs: validInput.operationTimeoutMs,
    allowInsecure: validInput.allowInsecure,
    createdAt: new Date("2026-07-28T00:00:00.000Z"),
    updatedAt: new Date("2026-07-28T01:00:00.000Z"),
    ...overrides,
  };
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

describe("LDAP configuration and authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("validates a standard secure LDAP configuration", () => {
    expect(parseLdapConfigurationInput(validInput)).toEqual({
      ...validInput,
      tlsCaCertificate: undefined,
    });
  });

  it("rejects plaintext simple bind unless explicitly allowed", () => {
    expect(() =>
      parseLdapConfigurationInput({
        ...validInput,
        url: "ldap://ldap.example.com:389",
        startTls: false,
      }),
    ).toThrow(LdapConfigurationError);
  });

  it("allows ldap without StartTLS when plaintext LDAP is explicitly enabled", () => {
    expect(
      parseLdapConfigurationInput({
        ...validInput,
        url: "ldap://ldap.example.com:389",
        startTls: false,
        allowInsecure: true,
      }),
    ).toEqual(
      expect.objectContaining({
        url: "ldap://ldap.example.com:389",
        startTls: false,
        allowInsecure: true,
      }),
    );
  });

  it("encrypts bind passwords with authenticated AES encryption", () => {
    const ciphertext = encryptLdapBindPassword(
      "service-password",
      encryptionKey,
    );

    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("service-password");
    expect(
      decryptLdapBindPassword(ciphertext, encryptionKey),
    ).toBe("service-password");
    const [version, iv, tag, encrypted] = ciphertext.split(".");
    const tamperedTag = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;
    expect(() =>
      decryptLdapBindPassword(
        [version, iv, tamperedTag, encrypted].join("."),
        encryptionKey,
      ),
    ).toThrow(LdapConfigurationError);
  });

  it("returns safe defaults without exposing stored cryptographic material", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock).mockResolvedValue(
      null,
    );

    const configuration = await getLdapConfiguration();

    expect(configuration).toEqual(
      expect.objectContaining({
        enabled: false,
        passwordConfigured: false,
        userFilter: "(uid={{username}})",
      }),
    );
    expect(configuration).not.toHaveProperty("encryptionKey");
    expect(configuration).not.toHaveProperty("bindPasswordCiphertext");
  });

  it("encrypts a new password and preserves it when later updates leave it blank", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedConfiguration());
    (mockPrisma.ldapConfiguration.create as jest.Mock).mockImplementation(
      ({ data }) => ({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    (mockPrisma.ldapConfiguration.update as jest.Mock).mockImplementation(
      ({ data }) => ({
        ...storedConfiguration(),
        ...data,
        updatedAt: new Date(),
      }),
    );

    const created = await saveLdapConfiguration(validInput);
    const createData = (mockPrisma.ldapConfiguration.create as jest.Mock).mock
      .calls[0][0].data;
    expect(created.passwordConfigured).toBe(true);
    expect(createData.encryptionKey).not.toBe(validInput.bindPassword);
    expect(createData.bindPasswordCiphertext).not.toContain(
      validInput.bindPassword,
    );
    expect(
      decryptLdapBindPassword(
        createData.bindPasswordCiphertext,
        createData.encryptionKey,
      ),
    ).toBe(validInput.bindPassword);

    await saveLdapConfiguration({
      ...validInput,
      bindPassword: undefined,
      enabled: false,
    });
    expect(mockPrisma.ldapConfiguration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bindPasswordCiphertext: expect.stringMatching(/^v1\./),
          encryptionKey,
        }),
      }),
    );
  });

  it("does not create an LDAP client when the stored configuration is disabled", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock).mockResolvedValue(
      storedConfiguration({ enabled: false }),
    );

    await expect(
      authenticateLdapUser("alice", "password"),
    ).resolves.toBeNull();
    expect(Client).not.toHaveBeenCalled();
  });

  it("searches with an RFC 4515 escaped username and binds as the user", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock).mockResolvedValue(
      storedConfiguration(),
    );
    const client = createClientMock();
    (Client as jest.Mock).mockImplementation(() => client);

    const identity = await authenticateLdapUser(
      "alice*)(uid=*)",
      "user-password",
    );

    expect(client.bind).toHaveBeenNthCalledWith(
      1,
      validInput.bindDn,
      "service-password",
    );
    expect(client.search).toHaveBeenCalledWith(
      validInput.searchBase,
      expect.objectContaining({
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
  });

  it("tests unsaved form values when a bind password is supplied", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    const client = createClientMock();
    (Client as jest.Mock).mockImplementation(() => client);

    await expect(
      testLdapConfiguration(
        validInput,
        "alice",
        "user-password",
      ),
    ).resolves.toBe(true);
    expect(client.bind).toHaveBeenNthCalledWith(
      1,
      validInput.bindDn,
      validInput.bindPassword,
    );
  });

  it("uses StartTLS before binding for ldap:// connections", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock).mockResolvedValue(
      storedConfiguration({
        url: "ldap://ldap.example.com:389",
        startTls: true,
      }),
    );
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

  it("maps invalid user credentials to an authentication miss", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock).mockResolvedValue(
      storedConfiguration(),
    );
    const client = createClientMock();
    client.bind
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new InvalidCredentialsError());
    (Client as jest.Mock).mockImplementation(() => client);

    await expect(
      authenticateLdapUser("alice", "wrong-password"),
    ).resolves.toBeNull();
  });

  it("treats invalid service credentials as an unavailable directory", async () => {
    (mockPrisma.ldapConfiguration.findUnique as jest.Mock).mockResolvedValue(
      storedConfiguration(),
    );
    const client = createClientMock();
    client.bind.mockRejectedValueOnce(new InvalidCredentialsError());
    (Client as jest.Mock).mockImplementation(() => client);

    await expect(
      authenticateLdapUser("alice", "user-password"),
    ).rejects.toBeInstanceOf(LdapUnavailableError);
    expect(client.search).not.toHaveBeenCalled();
  });
});
