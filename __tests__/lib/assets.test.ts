import {
  buildAssetSnapshot,
  readAssetTags,
  toAssetDTO,
  type AssetRow,
} from "@/lib/assets";

describe("asset helpers", () => {
  it("builds a stable snapshot from a case analysis", () => {
    expect(
      buildAssetSnapshot({
        caseNo: "TC-1",
        name: "登录",
        resultSummary: "FAIL",
        rootCause: "空指针",
        notes: "增加空值判断",
        mrOrTicket: "MR-1",
      })
    ).toEqual({
      title: "登录",
      summary: "来源用例：TC-1\n执行结果：FAIL\n问题根因：空指针",
      solution: "增加空值判断",
      rootCauseText: "空指针",
    });
  });

  it("safely reads JSON tags", () => {
    expect(readAssetTags(["回归", 1, "登录"])).toEqual(["回归", "登录"]);
    expect(readAssetTags(null)).toEqual([]);
    expect(readAssetTags({ 0: "登录" })).toEqual([]);
    expect(readAssetTags([null, true, {}, "有效"])).toEqual(["有效"]);
  });

  it("serializes dates, tags, and edit permission for DTOs", () => {
    const createdAt = new Date("2026-07-25T01:02:03.000Z");
    const updatedAt = new Date("2026-07-25T04:05:06.000Z");
    const asset = {
      id: "asset_1",
      sourceCaseId: null,
      projectId: "project_1",
      rootCauseCategoryId: null,
      title: "标题",
      summary: "摘要",
      solution: "方案",
      rootCauseText: null,
      tags: ["有效", 123],
      status: "PUBLISHED",
      version: 1,
      createdBy: null,
      updatedBy: null,
      viewCount: 0,
      reuseCount: 0,
      createdAt,
      updatedAt,
      project: { id: "project_1", name: "项目一" },
      rootCauseCategory: null,
      sourceCase: null,
    } satisfies AssetRow;

    expect(toAssetDTO(asset, false)).toMatchObject({
      tags: ["有效"],
      canEdit: false,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it.each([
    {
      label: "uses a ticket when notes are blank",
      notes: "  ",
      mrOrTicket: "  MR-2  ",
      solution: "MR-2",
    },
    {
      label: "uses the default when analysis has no solution",
      notes: null,
      mrOrTicket: null,
      solution: "待补充解决方案",
    },
  ])("$label", ({ notes, mrOrTicket, solution }) => {
    expect(
      buildAssetSnapshot({
        caseNo: "TC-2",
        name: "支付",
        resultSummary: "BLOCK",
        rootCause: "   ",
        notes,
        mrOrTicket,
      })
    ).toEqual({
      title: "支付",
      summary: "来源用例：TC-2\n执行结果：BLOCK",
      solution,
      rootCauseText: null,
    });
  });
});
