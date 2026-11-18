import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => {
  class MockDocumentStudioConflictError extends Error {}
  return {
    DocumentStudioConflictError: MockDocumentStudioConflictError,
    listDocumentTemplates: vi.fn(),
    getDocumentTemplate: vi.fn(),
    createDocumentTemplate: vi.fn(),
    updateDocumentTemplate: vi.fn(),
    deactivateDocumentTemplate: vi.fn(),
    listOfficialDocuments: vi.fn(),
    getOfficialDocument: vi.fn(),
    createOfficialDocument: vi.fn(),
    updateOfficialDocument: vi.fn(),
    archiveOfficialDocument: vi.fn(),
    issueOfficialDocument: vi.fn(),
  };
});

vi.mock("./documentStudioRepository", () => mocks);

const dbMocks = vi.hoisted(() => ({
  getUserOrganizationMembership: vi.fn(),
  getOrganizationSettings: vi.fn(),
  allocateOrganizationSerialNumber: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("../../db", async importOriginal => {
  const actual = await importOriginal<typeof import("../../db")>();
  return {
    ...actual,
    getUserOrganizationMembership: dbMocks.getUserOrganizationMembership,
    getOrganizationSettings: dbMocks.getOrganizationSettings,
    allocateOrganizationSerialNumber: dbMocks.allocateOrganizationSerialNumber,
    writeAuditLog: dbMocks.writeAuditLog,
  };
});

import { appRouter } from "../../routers";

const ownerId = "550e8400-e29b-41d4-a716-446655440000";
const timestamp = "2026-11-18T10:00:00.000Z";

function context(authenticated = true): TrpcContext {
  return {
    user: authenticated
      ? {
          id: 7,
          authUserId: ownerId,
          name: "Document Owner",
          badgeNumber: null,
          email: "owner@example.test",
          loginMethod: "appwrite",
          username: "owner",
          role: "user",
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
          lastSignedIn: new Date(timestamp),
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const template = {
  id: "template-1",
  ownerId,
  organizationId: "org-1",
  templateFieldsSnapshot: [],
  title: "كتاب تكليف",
  description: null,
  category: "personnel",
  content: { type: "doc", content: [] },
  fields: [],
  revision: 1,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const document = {
  id: "document-1",
  ownerId,
  title: "كتاب تكليف",
  category: "personnel",
  subject: "تكليف موظف",
  content: { type: "doc", content: [] },
  fieldValues: {},
  serialNumber: 0,
  serialCode: "",
  documentDate: timestamp,
  status: "draft" as const,
  templateId: null,
  templateRevision: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  issuedAt: null,
  archivedAt: null,
};

const templateInput = {
  title: "كتاب تكليف",
  category: "personnel",
  description: null,
  content: { type: "doc", content: [] },
  fields: [],
};

const documentInput = {
  title: "كتاب تكليف",
  category: "personnel",
  subject: "تكليف موظف",
  content: { type: "doc", content: [] },
  fieldValues: {},
  documentDate: timestamp,
  templateId: null,
  templateRevision: null,
};

describe("document studio authorization and API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getUserOrganizationMembership.mockResolvedValue({
      isActive: true,
      organizationId: "org-1",
    });
    dbMocks.getOrganizationSettings.mockResolvedValue({
      timezone: "UTC",
      serialPrefix: "DOC",
      numberSystem: "latin",
    });
    dbMocks.allocateOrganizationSerialNumber.mockResolvedValue(12);
    dbMocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.listDocumentTemplates.mockResolvedValue([template]);
    mocks.getDocumentTemplate.mockResolvedValue(template);
    mocks.createDocumentTemplate.mockResolvedValue(template);
    mocks.updateDocumentTemplate.mockResolvedValue(template);
    mocks.deactivateDocumentTemplate.mockResolvedValue({
      ...template,
      isActive: false,
      revision: 2,
    });
    mocks.listOfficialDocuments.mockResolvedValue([document]);
    mocks.getOfficialDocument.mockResolvedValue(document);
    mocks.createOfficialDocument.mockResolvedValue(document);
    mocks.updateOfficialDocument.mockResolvedValue(document);
    mocks.archiveOfficialDocument.mockResolvedValue({
      ...document,
      status: "archived",
      archivedAt: timestamp,
    });
    mocks.issueOfficialDocument.mockResolvedValue({
      ...document,
      status: "issued",
      serialNumber: 12,
      serialCode: "DOC-00012",
      issuedAt: timestamp,
    });
    dbMocks.getUserOrganizationMembership.mockResolvedValue({
      isActive: true,
      organizationId: "org-1",
    });
    dbMocks.getOrganizationSettings.mockResolvedValue({
      timezone: "UTC",
      serialPrefix: "DOC",
      numberSystem: "latin",
    });
    dbMocks.allocateOrganizationSerialNumber.mockResolvedValue(12);
    dbMocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("scopes template and document lists to the authenticated Appwrite owner", async () => {
    const caller = appRouter.createCaller(context());

    await caller.documentStudio.listTemplates();
    await caller.documentStudio.listDocuments();

    expect(mocks.listDocumentTemplates).toHaveBeenCalledWith(ownerId);
    expect(mocks.listOfficialDocuments).toHaveBeenCalledWith(ownerId);
  });

  it("derives template ownership from the session, not mutation input", async () => {
    const caller = appRouter.createCaller(context());

    await caller.documentStudio.createTemplate(templateInput);

    expect(mocks.createDocumentTemplate).toHaveBeenCalledWith(ownerId, {
      ...templateInput,
      description: null,
    });
  });

  it("captures the current owned template revision when creating a document", async () => {
    const caller = appRouter.createCaller(context());

    await caller.documentStudio.createDocument({
      ...documentInput,
      templateId: template.id,
      templateRevision: template.revision,
    });

    expect(mocks.getDocumentTemplate).toHaveBeenCalledWith(
      ownerId,
      template.id
    );
    expect(mocks.createOfficialDocument).toHaveBeenCalledWith(ownerId, {
      ...documentInput,
      organizationId: "org-1",
      templateId: template.id,
      templateRevision: template.revision,
      templateFieldsSnapshot: template.fields,
    });
  });

  it("does not create a document from a template owned by another user", async () => {
    mocks.getDocumentTemplate.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(context());

    await expect(
      caller.documentStudio.createDocument({
        ...documentInput,
        templateId: template.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
  });

  it("rejects duplicate template field keys before writing", async () => {
    const caller = appRouter.createCaller(context());

    await expect(
      caller.documentStudio.createTemplate({
        ...templateInput,
        fields: [
          {
            key: "employee_name",
            label: "الاسم",
            type: "text",
            required: true,
          },
          {
            key: "employee_name",
            label: "الاسم الثاني",
            type: "text",
            required: false,
          },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createDocumentTemplate).not.toHaveBeenCalled();
  });

  it("maps stale document writes to a conflict response", async () => {
    mocks.updateOfficialDocument.mockRejectedValueOnce(
      new mocks.DocumentStudioConflictError("stale")
    );
    const caller = appRouter.createCaller(context());

    await expect(
      caller.documentStudio.updateDocument({
        ...documentInput,
        id: document.id,
        expectedUpdatedAt: timestamp,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allocates an outgoing serial only when issuing an owned draft", async () => {
    const caller = appRouter.createCaller(context());

    const saved = await caller.documentStudio.issueDocument({
      id: document.id,
      expectedUpdatedAt: timestamp,
    });

    expect(dbMocks.allocateOrganizationSerialNumber).toHaveBeenCalledWith(
      "org-1",
      "outgoing"
    );
    expect(mocks.issueOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      document.id,
      timestamp,
      expect.objectContaining({
        organizationId: "org-1",
        serialNumber: 12,
        serialCode: expect.stringMatching(/^DOC-00012$/),
      })
    );
    expect(dbMocks.writeAuditLog).toHaveBeenCalled();
    expect(saved.status).toBe("issued");
  });

  it("validates required template values before creating a document", async () => {
    mocks.getDocumentTemplate.mockResolvedValueOnce({
      ...template,
      fields: [
        {
          key: "employee_name",
          label: "اسم الموظف",
          type: "text",
          required: true,
        },
      ],
    });
    const caller = appRouter.createCaller(context());

    await expect(
      caller.documentStudio.createDocument({
        ...documentInput,
        templateId: template.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
  });

  it("archives without physically deleting the owned document", async () => {
    const caller = appRouter.createCaller(context());

    await caller.documentStudio.archiveDocument({
      id: document.id,
      expectedUpdatedAt: timestamp,
    });

    expect(mocks.archiveOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      document.id,
      timestamp
    );
  });

  it("rejects unauthenticated access before calling repositories", async () => {
    const caller = appRouter.createCaller(context(false));

    await expect(caller.documentStudio.listDocuments()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.documentStudio.createTemplate(templateInput)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.listOfficialDocuments).not.toHaveBeenCalled();
    expect(mocks.createDocumentTemplate).not.toHaveBeenCalled();
  });
});
