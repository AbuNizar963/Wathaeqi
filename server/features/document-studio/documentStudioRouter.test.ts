import { beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
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
  writeAuditLog: vi.fn(),
}));

const documentOrganizationMocks = vi.hoisted(() => ({
  getDocumentOrganizationSettings: vi.fn(),
  allocateDocumentOrganizationSerialNumber: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  getObjectInfo: vi.fn(),
  download: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./documentOrganizationRepository", () => documentOrganizationMocks);

vi.mock("../organizations/appwriteOwnerOrganizationRepository", () => ({
  getOrganizationById: vi.fn(),
  getUserOrganizationMembership: dbMocks.getUserOrganizationMembership,
}));

vi.mock("../audit/appwriteAuditRepository", () => ({
  writeAuditLog: dbMocks.writeAuditLog,
}));

vi.mock("../../_core/storageProvider", () => ({
  getStorageProvider: () => storageMocks,
}));

import { documentStudioRouter } from "./documentStudioRouter";

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
          role: "admin",
          isPlatformOwner: true,
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
          lastSignedIn: new Date(timestamp),
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function nonOwnerContext(): TrpcContext {
  const ownerContext = context();
  return {
    ...ownerContext,
    user: ownerContext.user
      ? { ...ownerContext.user, role: "user", isPlatformOwner: false }
      : null,
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
  organizationId: null,
  templateFieldsSnapshot: [],
  title: "كتاب تكليف",
  category: "personnel",
  subject: "تكليف موظف",
  content: { type: "doc", content: [] },
  fieldValues: {},
  serialNumber: 0,
  serialCode: "",
  documentDate: timestamp,
  status: "draft" as const,
  file: null,
  templateId: null,
  templateRevision: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  issuedAt: null,
  archivedAt: null,
};

const uploadBytes = Buffer.from(
  zipSync({
    "[Content_Types].xml": Buffer.from("<Types/>", "utf8"),
    "word/document.xml": Buffer.from("<document/>", "utf8"),
  })
);
const uploadedFileName = "report.docx";
const uploadedStorageKey = `documents/${ownerId}/550e8400-e29b-41d4-a716-446655440001-${uploadedFileName}`;

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
      role: "organization_admin",
    });
    documentOrganizationMocks.getDocumentOrganizationSettings.mockResolvedValue(
      {
        organizationId: "org-1",
        timezone: "UTC",
        serialPrefix: "DOC",
        numberSystem: "latin",
        departmentName: "إدارة الوثائق",
        unitName: "الوحدة",
        unitChiefRank: "",
        unitChiefName: "",
        logoUrl: null,
        dateFormat: "dd/MM/yyyy",
      }
    );
    const allocateSerialNumber =
      documentOrganizationMocks.allocateDocumentOrganizationSerialNumber;
    allocateSerialNumber.mockResolvedValue(12);
    dbMocks.writeAuditLog.mockResolvedValue(undefined);
    storageMocks.getObjectInfo.mockResolvedValue({
      size: uploadBytes.length,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    storageMocks.download.mockResolvedValue({
      body: uploadBytes,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
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
  });

  it("returns active organization letterhead settings", async () => {
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.getLetterheadSettings({
      organizationId: "org-1",
    });

    expect(
      documentOrganizationMocks.getDocumentOrganizationSettings
    ).toHaveBeenCalledWith("org-1");
    expect(result).toMatchObject({
      organizationId: "org-1",
      serialPrefix: "DOC",
      timezone: "UTC",
    });
  });

  it("does not expose another organization's letterhead", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.getLetterheadSettings({
        organizationId: "org-2",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      documentOrganizationMocks.getDocumentOrganizationSettings
    ).not.toHaveBeenCalled();
  });

  it("scopes lists to the authenticated owner", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await caller.listTemplates();
    await caller.listDocuments();

    expect(mocks.listDocumentTemplates).toHaveBeenCalledWith(ownerId);
    expect(mocks.listOfficialDocuments).toHaveBeenCalledWith(ownerId);
  });

  it("allows authenticated organization users to access their own document workspace", async () => {
    const userContext = nonOwnerContext();
    if (userContext.user) {
      userContext.user.authUserId = "organization-user-8";
    }
    const caller = documentStudioRouter.createCaller(userContext);

    const result = await caller.listDocuments();

    expect(result).toEqual([document]);
    expect(mocks.listOfficialDocuments).toHaveBeenCalledWith(
      "organization-user-8"
    );
  });

  it("revalidates uploaded DOCX ownership and bytes and hides storage keys", async () => {
    const caller = documentStudioRouter.createCaller(context());
    const attachedDocument = {
      ...document,
      file: {
        storageKey: uploadedStorageKey,
        fileName: uploadedFileName,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: uploadBytes.length,
        pageCount: 0,
      },
    };
    mocks.createOfficialDocument.mockResolvedValueOnce(attachedDocument);

    const result = await caller.createUploadedDocument({
      title: "ملف مرفوع",
      storageKey: uploadedStorageKey,
      fileName: uploadedFileName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: uploadBytes.length,
      pageCount: 0,
    });

    expect(storageMocks.getObjectInfo).toHaveBeenCalledWith(uploadedStorageKey);
    expect(storageMocks.download).toHaveBeenCalledWith(uploadedStorageKey);
    expect(mocks.createOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({
        file: expect.objectContaining({ pageCount: 0 }),
      })
    );
    expect(result.file).toMatchObject({
      fileName: uploadedFileName,
      pageCount: 0,
    });
    expect(result.file).not.toHaveProperty("storageKey");
  });

  it("rejects another owner's storage key before accessing Storage", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.createUploadedDocument({
        title: "ملف مرفوع",
        storageKey: `documents/another-owner/550e8400-e29b-41d4-a716-446655440001-${uploadedFileName}`,
        fileName: uploadedFileName,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: uploadBytes.length,
        pageCount: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storageMocks.getObjectInfo).not.toHaveBeenCalled();
  });

  it("rejects Appwrite metadata whose MIME does not match the file extension", async () => {
    storageMocks.getObjectInfo.mockResolvedValueOnce({
      size: uploadBytes.length,
      contentType: "application/octet-stream",
    });
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.createUploadedDocument({
        title: "ملف مرفوع",
        storageKey: uploadedStorageKey,
        fileName: uploadedFileName,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: uploadBytes.length,
        pageCount: 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storageMocks.download).not.toHaveBeenCalled();
    expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
  });

  it("rejects corrupt uploaded bytes even when metadata matches", async () => {
    const corruptBytes = Buffer.from("not a DOCX");
    storageMocks.getObjectInfo.mockResolvedValueOnce({
      size: corruptBytes.length,
      contentType: "application/octet-stream",
    });
    storageMocks.download.mockResolvedValueOnce({
      body: corruptBytes,
      contentType: "application/octet-stream",
    });
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.createUploadedDocument({
        title: "ملف مرفوع",
        storageKey: uploadedStorageKey,
        fileName: uploadedFileName,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: corruptBytes.length,
        pageCount: 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
  });

  it("uses session owner for template writes", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await caller.createTemplate(templateInput);

    expect(mocks.createDocumentTemplate).toHaveBeenCalledWith(ownerId, {
      ...templateInput,
      description: null,
    });
  });

  it("snapshots template revision on document creation", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await caller.createDocument({
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

  it("rejects templates owned by another user", async () => {
    mocks.getDocumentTemplate.mockResolvedValueOnce(null);
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.createDocument({
        ...documentInput,
        templateId: template.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
  });

  it("rejects duplicate template field keys before writing", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.createTemplate({
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
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.updateDocument({
        ...documentInput,
        id: document.id,
        expectedUpdatedAt: timestamp,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allocates serial for an owned draft", async () => {
    const caller = documentStudioRouter.createCaller(context());

    const saved = await caller.issueDocument({
      id: document.id,
      expectedUpdatedAt: timestamp,
    });

    expect(
      documentOrganizationMocks.allocateDocumentOrganizationSerialNumber
    ).toHaveBeenCalledWith("org-1");
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

  it("validates required template values before create", async () => {
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
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.createDocument({
        ...documentInput,
        templateId: template.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
  });

  it("archives without physically deleting the owned document", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await caller.archiveDocument({
      id: document.id,
      expectedUpdatedAt: timestamp,
    });

    expect(mocks.archiveOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      document.id,
      timestamp
    );
  });

  it("rejects an invalid revision timestamp before accessing storage", async () => {
    const caller = documentStudioRouter.createCaller(context());

    await expect(
      caller.archiveDocument({
        id: document.id,
        expectedUpdatedAt: "not-a-utc-timestamp",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.archiveOfficialDocument).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access before calling repositories", async () => {
    const caller = documentStudioRouter.createCaller(context(false));

    await expect(caller.listDocuments()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.createTemplate(templateInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.listOfficialDocuments).not.toHaveBeenCalled();
    expect(mocks.createDocumentTemplate).not.toHaveBeenCalled();
  });
});
