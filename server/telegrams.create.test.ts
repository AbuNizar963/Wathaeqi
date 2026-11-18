import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocked = vi.hoisted(() => ({
  allocateSerialNumber: vi.fn(),
  allocateOrganizationSerialNumber: vi.fn(),
  getSuggestedOrganizationSerialNumber: vi.fn(),
  reserveOrganizationSerialNumber: vi.fn(),
  createTelegram: vi.fn(),
  writeAuditLog: vi.fn(),
  getDashboardStats: vi.fn(),
  getMaxSerialNumber: vi.fn(),
  getOrCreateSettings: vi.fn(),
  getOrganizationSettings: vi.fn(),
  getTelegramById: vi.fn(),
  listTelegrams: vi.fn(),
  updateDepartmentSettings: vi.fn(),
  getUserOrganizationId: vi.fn(),
  getTelegramByIdempotencyKey: vi.fn(),
  recordTelegramAction: vi.fn(),
  recordTelegramVersion: vi.fn(),
  listTelegramVersions: vi.fn(),
  getConfiguredTelegramDestination: vi.fn(),
  listRoutingTargets: vi.fn(),
  listOrganizationDescendants: vi.fn(),
  routeTelegram: vi.fn(),
  routeTelegramBroadcastAtomic: vi.fn(),
  hasTelegramRoute: vi.fn(),
}));
const organizationMocks = vi.hoisted(() => ({
  getUserOrganizationMembership: vi.fn(),
  getOrganizationById: vi.fn(),
}));

vi.mock("./db", () => mocked);
vi.mock("./features/organizations/organization", async importOriginal => {
  const actual =
    await importOriginal<
      typeof import("./features/organizations/organization")
    >();
  return {
    ...actual,
    getConfiguredTelegramDestination: mocked.getConfiguredTelegramDestination,
    listRoutingTargets: mocked.listRoutingTargets,
    listOrganizationDescendants: mocked.listOrganizationDescendants,
    routeTelegram: mocked.routeTelegram,
    routeTelegramBroadcastAtomic: mocked.routeTelegramBroadcastAtomic,
    hasTelegramRoute: mocked.hasTelegramRoute,
    getUserOrganizationMembership:
      organizationMocks.getUserOrganizationMembership,
    getOrganizationById: organizationMocks.getOrganizationById,
  };
});

function createContext(): TrpcContext {
  return {
    user: {
      id: 42,
      authUserId: "00000000-0000-4000-8000-000000000042",
      name: "النقيب أحمد",
      badgeNumber: null,
      email: "ahmad@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("telegrams.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let allocatedSerialNumber = 1000;
    let allocatedOrganizationSerialNumber = 0;
    mocked.allocateSerialNumber.mockImplementation(
      async () => ++allocatedSerialNumber
    );
    mocked.allocateOrganizationSerialNumber.mockImplementation(
      async () => ++allocatedOrganizationSerialNumber
    );
    mocked.getSuggestedOrganizationSerialNumber.mockResolvedValue(1);
    mocked.reserveOrganizationSerialNumber.mockResolvedValue(77);
    mocked.getUserOrganizationId.mockResolvedValue(
      "00000000-0000-0000-0000-000000000001"
    );
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId: "00000000-0000-0000-0000-000000000001",
      role: "member",
      isActive: true,
    });
    organizationMocks.getOrganizationById.mockImplementation(async id => ({
      id,
      name: "قسم شرطة الشهباء",
      type: "department",
      code: "SHAHBA",
      isActive: true,
      parentOrganizationId: null,
    }));
    mocked.getOrganizationSettings.mockResolvedValue(undefined);
    mocked.getOrCreateSettings.mockResolvedValue({
      serialPrefix: "OUT",
      incomingSerialPrefix: "IN",
      timezone: "Asia/Riyadh",
      numberSystem: "latin",
    });
    mocked.createTelegram.mockImplementation(async input => ({
      id: 7,
      createdAt: new Date(),
      ...input,
    }));
    mocked.writeAuditLog.mockResolvedValue(undefined);
    mocked.getTelegramByIdempotencyKey.mockResolvedValue(undefined);
    mocked.recordTelegramAction.mockResolvedValue(undefined);
    mocked.recordTelegramVersion.mockResolvedValue(undefined);
    mocked.listTelegramVersions.mockResolvedValue([]);
    mocked.getConfiguredTelegramDestination.mockResolvedValue(null);
    mocked.listRoutingTargets.mockResolvedValue([]);
    mocked.listOrganizationDescendants.mockResolvedValue([]);
    mocked.routeTelegram.mockResolvedValue(undefined);
    mocked.routeTelegramBroadcastAtomic.mockResolvedValue({
      primaryRoute: { id: 11 },
      copies: [],
    });
    mocked.hasTelegramRoute.mockResolvedValue(false);
  });

  it("captures the issuing organization's immutable logo key in the first version snapshot", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000001";
    const logoKey = `department/logos/${organizationId}/00000000-0000-4000-8000-000000000099-letterhead.png`;
    mocked.getUserOrganizationId.mockResolvedValue(organizationId);
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId,
      role: "member",
      isActive: true,
    });
    mocked.getOrganizationSettings.mockResolvedValue({
      departmentName: "قسم شرطة الشهباء",
      unitName: "قسم شرطة الشهباء",
      unitChiefRank: "المقدم",
      unitChiefName: "غسان صالح كنو",
      logoKey: `/api/storage/${logoKey}`,
      logoUrl: `/api/storage/${logoKey}`,
    });

    const caller = appRouter.createCaller(createContext());
    await caller.telegrams.create({
      subject: "تجربة حفظ الشعار",
      recipient: "غرفة العمليات",
      body: "محتوى البرقية للاختبار",
      classification: "normal",
      priority: "normal",
      category: "administrative",
    });

    expect(mocked.recordTelegramVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          schemaVersion: 2,
          organizationId,
          letterhead: expect.objectContaining({
            organizationId,
            organizationName: "قسم شرطة الشهباء",
            departmentName: "قسم شرطة الشهباء",
            unitChiefRank: "المقدم",
            unitChiefName: "غسان صالح كنو",
            logoStorageKey: logoKey,
            logoContentType: "image/png",
          }),
        }),
      })
    );
  });

  it("returns frozen letterhead metadata without exposing the private logo storage key", async () => {
    const organizationId = "00000000-0000-4000-8000-000000000001";
    const logoKey = `department/logos/${organizationId}/00000000-0000-4000-8000-000000000099-letterhead.png`;
    mocked.getTelegramById.mockResolvedValueOnce({
      id: 7,
      organizationId,
      currentOrganizationId: organizationId,
      createdAt: new Date(),
    });
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId,
      role: "member",
      isActive: true,
    });
    mocked.listTelegramVersions.mockResolvedValueOnce([
      {
        id: 1,
        telegramId: 7,
        versionNumber: 1,
        changedByUserId: 42,
        changeReason: "الإصدار الأول",
        createdAt: new Date(),
        snapshot: {
          schemaVersion: 2,
          letterhead: {
            organizationId,
            organizationName: "قسم شرطة الشهباء",
            departmentName: "قسم شرطة الشهباء",
            unitName: "قيادة الأمن الداخلي في محافظة حلب",
            unitChiefRank: "المقدم",
            unitChiefName: "غسان صالح كنو",
            logoStorageKey: logoKey,
            logoContentType: "image/png",
          },
        },
      },
    ]);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.telegrams.versions({ telegramId: 7 });
    const letterhead = result[0].snapshot.letterhead as Record<string, unknown>;

    expect(letterhead).toMatchObject({
      organizationName: "قسم شرطة الشهباء",
      departmentName: "قسم شرطة الشهباء",
      unitName: "قيادة الأمن الداخلي في محافظة حلب",
      unitChiefRank: "المقدم",
      unitChiefName: "غسان صالح كنو",
      hasLogo: true,
    });
    expect(letterhead).not.toHaveProperty("logoStorageKey");
  });

  it("reissues a telegram under the same official number and records a new version", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    const logoKey = `department/logos/${organizationId}/550e8400-e29b-41d4-a716-446655440001-letterhead.png`;
    const telegram = {
      id: 7,
      serialNumber: 55,
      serialCode: "OUT-2026-10-31-00055",
      organizationId,
      currentOrganizationId: organizationId,
      subject: "تعميم إداري",
      recipient: "غرفة العمليات",
      body: "النص الأصلي للبرقية",
      classification: "normal",
      priority: "normal",
      category: "administrative",
      status: "approved",
      createdAt: new Date(),
    };
    mocked.getTelegramById.mockResolvedValueOnce(telegram);
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId,
      role: "member",
      isActive: true,
    });
    mocked.getOrganizationSettings.mockResolvedValueOnce({
      logoKey: `/api/storage/${logoKey}`,
      logoUrl: `/api/storage/${logoKey}`,
    });
    mocked.recordTelegramVersion.mockResolvedValueOnce(3);

    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.telegrams.reissue({
        id: telegram.id,
        reason: "تحديث الشعار الرسمي للجهة",
      })
    ).resolves.toEqual({
      success: true,
      telegramId: telegram.id,
      serialNumber: telegram.serialNumber,
      serialCode: telegram.serialCode,
      versionNumber: 3,
      actionLogRecorded: true,
      auditLogRecorded: true,
    });

    expect(mocked.recordTelegramVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: telegram.id,
        changedByUserId: 42,
        changeReason: expect.stringContaining("تحديث الشعار الرسمي للجهة"),
        snapshot: expect.objectContaining({
          serialNumber: telegram.serialNumber,
          serialCode: telegram.serialCode,
          letterhead: expect.objectContaining({
            organizationId,
            logoStorageKey: logoKey,
            logoContentType: "image/png",
          }),
          issuance: expect.objectContaining({
            type: "reissue",
            officialSerialCode: telegram.serialCode,
          }),
        }),
      })
    );
    expect(mocked.recordTelegramAction).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: telegram.id,
        actorUserId: 42,
        action: "telegram.reissue",
        reason: "تحديث الشعار الرسمي للجهة",
        metadata: expect.objectContaining({ versionNumber: 3 }),
      })
    );
    expect(mocked.allocateSerialNumber).not.toHaveBeenCalled();
    expect(mocked.allocateOrganizationSerialNumber).not.toHaveBeenCalled();
  });

  it("requires a saved organization logo before creating a reissue version", async () => {
    const organizationId = "550e8400-e29b-41d4-a716-446655440000";
    mocked.getTelegramById.mockResolvedValueOnce({
      id: 7,
      serialNumber: 55,
      serialCode: "OUT-2026-10-31-00055",
      organizationId,
      currentOrganizationId: organizationId,
      subject: "تعميم إداري",
      recipient: "غرفة العمليات",
      body: "النص الأصلي للبرقية",
      classification: "normal",
      priority: "normal",
      category: "administrative",
      status: "approved",
      createdAt: new Date(),
      creatorName: "موظف",
      verificationToken: "verify-token",
    });
    organizationMocks.getUserOrganizationMembership.mockResolvedValue({
      organizationId,
      role: "member",
      isActive: true,
    });
    mocked.getOrganizationSettings.mockResolvedValueOnce({
      logoKey: null,
      logoUrl: null,
    });

    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.telegrams.reissue({
        id: 7,
        reason: "إعادة إصدار بعد تحديث الشعار",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocked.recordTelegramVersion).not.toHaveBeenCalled();
  });

  it("uses the authenticated officer identity instead of accepting a client-supplied author", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.telegrams.create({
      subject: "تنبيه أمني",
      recipient: "غرفة العمليات",
      body: "محتوى البرقية للاختبار",
      classification: "normal",
      priority: "urgent",
      category: "security",
    });

    expect(result?.serialNumber).toBe(1001);
    expect(mocked.createTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 42,
        organizationId: "00000000-0000-0000-0000-000000000001",
        currentOrganizationId: "00000000-0000-0000-0000-000000000001",
        creatorName: "النقيب أحمد",
        creatorEmail: "ahmad@example.com",
        creatorFingerprint: "00000000-0000-4000-8000-000000000042",
        serialNumber: 1001,
        serialCode: expect.stringMatching(/^OUT-\d{4}-\d{2}-\d{2}-\d{5}$/),
        organizationSerialNumber: 1,
        organizationSerialCode: expect.stringMatching(
          /^OUT-\d{4}-\d{2}-\d{2}-00001$/
        ),
        verificationToken: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      })
    );
    expect(mocked.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 42,
        actorName: "النقيب أحمد",
        action: "telegram.create",
        entityType: "telegram",
      })
    );
    expect(mocked.routeTelegram).not.toHaveBeenCalled();
  });

  it("uses a caller-selected telegram number while keeping the global serial internal", async () => {
    const caller = appRouter.createCaller(createContext());

    await caller.telegrams.create({
      subject: "تنبيه أمني",
      recipient: "غرفة العمليات",
      body: "محتوى البرقية للاختبار",
      classification: "normal",
      priority: "urgent",
      category: "security",
      requestedOrganizationSerialNumber: 77,
    });

    expect(mocked.reserveOrganizationSerialNumber).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      77
    );
    expect(mocked.allocateOrganizationSerialNumber).not.toHaveBeenCalled();
    expect(mocked.createTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        serialNumber: 1001,
        organizationSerialNumber: 77,
        organizationSerialCode: expect.stringMatching(
          /^OUT-\d{4}-\d{2}-\d{2}-00077$/
        ),
      })
    );
  });

  it("rejects an unavailable caller-selected number before allocating a global serial", async () => {
    mocked.reserveOrganizationSerialNumber.mockRejectedValue(
      new Error(
        "Organization serial reservation failed: رقم البرقية مستخدم بالفعل لهذه الجهة"
      )
    );
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.telegrams.create({
        subject: "تنبيه أمني",
        recipient: "غرفة العمليات",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "urgent",
        category: "security",
        requestedOrganizationSerialNumber: 77,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocked.allocateSerialNumber).not.toHaveBeenCalled();
    expect(mocked.createTelegram).not.toHaveBeenCalled();
  });

  it("returns the next outgoing number for the active organization", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.telegrams.nextOutgoingSerial()).resolves.toEqual({
      number: 1,
    });
    expect(mocked.getSuggestedOrganizationSerialNumber).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001"
    );
  });

  it("converts telegram text digits to the organization's configured system before saving", async () => {
    mocked.getOrCreateSettings.mockResolvedValue({
      serialPrefix: "OUT",
      incomingSerialPrefix: "IN",
      timezone: "Asia/Riyadh",
      numberSystem: "arabic",
    });
    const caller = appRouter.createCaller(createContext());

    await caller.telegrams.create({
      subject: "بلاغ 123/٤",
      recipient: "الوحدة 7",
      body: "تحركت الدورية 12 إلى الموقع ٣",
      classification: "normal",
      priority: "normal",
      category: "security",
    });

    expect(mocked.createTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "بلاغ ١٢٣/٤",
        recipient: "الوحدة ٧",
        body: "تحركت الدورية ١٢ إلى الموقع ٣",
      })
    );
  });

  it("accepts every supported police telegram category", async () => {
    const categories = [
      "criminal",
      "administrative",
      "traffic",
      "security",
      "tactical",
      "intelligence",
      "emergency",
      "public_order",
      "personnel",
      "logistics",
      "training",
      "community",
      "other",
    ] as const;
    const caller = appRouter.createCaller(createContext());

    for (const category of categories) {
      await caller.telegrams.create({
        subject: `اختبار ${category}`,
        recipient: "غرفة العمليات",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "normal",
        category,
      });
    }

    expect(mocked.createTelegram).toHaveBeenCalledTimes(categories.length);
  });

  it("returns the persisted telegram when a concurrent retry wins the idempotency race", async () => {
    const caller = appRouter.createCaller(createContext());
    const persistedTelegram = {
      id: 88,
      serialNumber: 1002,
      serialCode: "POL-2026-10-02-01002",
      status: "draft",
    };
    mocked.createTelegram.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint")
    );
    mocked.getTelegramByIdempotencyKey
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(persistedTelegram);

    await expect(
      caller.telegrams.create({
        subject: "تنبيه أمني",
        recipient: "غرفة العمليات",
        body: "محتوى البرقية للاختبار",
        classification: "normal",
        priority: "urgent",
        category: "security",
        idempotencyKey: "create-telegram-race-0001",
      })
    ).resolves.toEqual(persistedTelegram);

    expect(mocked.writeAuditLog).not.toHaveBeenCalled();
    expect(mocked.recordTelegramAction).not.toHaveBeenCalled();
    expect(mocked.recordTelegramVersion).not.toHaveBeenCalled();
  });
});
