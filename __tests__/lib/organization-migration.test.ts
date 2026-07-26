import fs from "node:fs";
import path from "node:path";

describe("organization tenancy migration", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "prisma/migrations/20260727233000_add_organization_tenancy/migration.sql",
    ),
    "utf8",
  );

  it("creates the legacy organization and backfills before enforcing NOT NULL", () => {
    const insertOrganization = sql.indexOf("INSERT INTO `Organization`");
    const backfillMembers = sql.indexOf("INSERT INTO `OrganizationMember`");
    const backfillProjects = sql.indexOf(
      "UPDATE `Project` SET `organizationId`",
    );
    const enforceRequired = sql.indexOf(
      "MODIFY `organizationId` VARCHAR(191) NOT NULL",
    );

    expect(insertOrganization).toBeGreaterThan(-1);
    expect(backfillMembers).toBeGreaterThan(insertOrganization);
    expect(backfillProjects).toBeGreaterThan(backfillMembers);
    expect(enforceRequired).toBeGreaterThan(backfillProjects);
    expect(sql).not.toContain("DELETE FROM");
  });

  it("removes global project-name uniqueness only after tenant backfill", () => {
    expect(sql.indexOf("DROP INDEX `Project_name_key`")).toBeGreaterThan(
      sql.indexOf("UPDATE `Project` SET `organizationId`"),
    );
    expect(sql).toContain(
      "CREATE UNIQUE INDEX `Project_organizationId_name_key`",
    );
  });
});
