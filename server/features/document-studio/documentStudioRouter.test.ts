import { beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import type { TrpcContext } from "../../_core/context";
import {
  applyFieldValues,
  plainTextDocument,
} from "../../../client/src/features/document-studio/documentEditorContent";

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
    deleteOfficialDocument: vi.fn(),
    updateOfficialDocument: vi.fn(),
    archiveOfficialDocument: vi.fn(),
    issueOfficialDocument: vi.fn(),
    listOfficialDocumentVersions: vi.fn(),
    restoreOfficialDocumentVersion: vi.fn(),
  };
});

vi.mock("./documentStudioRepository", () => mocks);

const dbMocks = vi.hoisted(() => ({
  resolveOrganizationScope: vi.fn(),
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

vi.mock("../organizations/organizationAccess", () => ({
  resolveOrganizationScope: dbMocks.resolveOrganizationScope,
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
    dbMocks.resolveOrganizationScope.mockResolvedValue({
      userId: 7,
      organizationId: "org-1",
      organizationIds: ["org-1"],
      role: "organization_admin",
      isOwner: true,
      canManage: true,
      canAdministrate: true,
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
    mocks.listOfficialDocumentVersions.mockResolvedValue([
      {
        version: 1,
        savedAt: timestamp,
        savedByUserId: ownerId,
        title: "عنوان سابق",
      },
    ]);
    mocks.restoreOfficialDocumentVersion.mockResolvedValue({
      ...document,
      title: "عنوان سابق",
      updatedAt: "2026-11-24T11:00:00.000Z",
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

  it("uses session owner and records successful template creation", async () => {
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.createTemplate(templateInput);

    expect(mocks.createDocumentTemplate).toHaveBeenCalledWith(ownerId, {
      ...templateInput,
      description: null,
    });
    expect(result).toEqual({ template, auditLogRecorded: true });
    expect(dbMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.template.created",
        entityType: "document_template",
        entityId: template.id,
        afterState: expect.objectContaining({ title: template.title }),
      })
    );
  });

  it("reports template creation when audit logging is unavailable", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    dbMocks.writeAuditLog.mockRejectedValueOnce(new Error("audit unavailable"));
    const caller = documentStudioRouter.createCaller(context());

    try {
      const result = await caller.createTemplate(templateInput);
      expect(result).toEqual({ template, auditLogRecorded: false });
    } finally {
      logError.mockRestore();
    }
  });

  it("records before and after state when a template is updated", async () => {
    const updatedTemplate = {
      ...template,
      title: "كتاب تكليف معدل",
      revision: 2,
    };
    mocks.updateDocumentTemplate.mockResolvedValueOnce(updatedTemplate);
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.updateTemplate({
      ...templateInput,
      id: template.id,
      expectedRevision: template.revision,
      title: updatedTemplate.title,
    });

    expect(result).toEqual({
      template: updatedTemplate,
      auditLogRecorded: true,
    });
    expect(dbMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.template.updated",
        beforeState: expect.objectContaining({ title: template.title }),
        afterState: expect.objectContaining({ title: updatedTemplate.title }),
      })
    );
  });

  it("records template deactivation and keeps the saved template result", async () => {
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.deactivateTemplate({
      id: template.id,
      expectedRevision: template.revision,
    });

    expect(result.template.isActive).toBe(false);
    expect(result.auditLogRecorded).toBe(true);
    expect(dbMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "document.template.deactivated",
        beforeState: expect.objectContaining({ isActive: true }),
        afterState: expect.objectContaining({ isActive: false }),
      })
    );
  });

  it("accepts a user-edited legacy plain-text document as canonical content", async () => {
    const caller = documentStudioRouter.createCaller(context());
    const content = plainTextDocument("تحرير المستخدم\n\nالسطر الأخير\n");

    await caller.updateDocument({
      ...documentInput,
      id: document.id,
      expectedUpdatedAt: timestamp,
      content,
    });

    expect(mocks.updateOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      document.id,
      timestamp,
      expect.objectContaining({ content })
    );
  });

  it("preserves legacy HTML and plain text for metadata-only saves", async () => {
    const caller = documentStudioRouter.createCaller(context());
    const html = {
      type: "legacy-html",
      html: '<p dir="rtl"><strong>نص</strong></p>',
    };
    const legacyText = { type: "legacy-text", text: "نص قديم\n" };

    await caller.updateDocument({
      ...documentInput,
      id: document.id,
      expectedUpdatedAt: timestamp,
      content: html,
    });
    await caller.updateTemplate({
      ...templateInput,
      id: template.id,
      expectedRevision: template.revision,
      content: legacyText,
    });

    expect(mocks.updateOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      document.id,
      timestamp,
      expect.objectContaining({ content: html })
    );
    expect(mocks.updateDocumentTemplate).toHaveBeenCalledWith(
      ownerId,
      template.id,
      template.revision,
      expect.objectContaining({ content: legacyText })
    );
  });

  it("sends rich content and field values to the server without flattening", async () => {
    const caller = documentStudioRouter.createCaller(context());
    const fields = [
      {
        key: "employee_name",
        label: "الاسم",
        type: "text" as const,
        required: true,
      },
    ];
    mocks.getDocumentTemplate.mockResolvedValueOnce({ ...template, fields });
    const rich = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "{{employee_name}}",
              marks: [{ type: "bold" }],
            },
          ],
        },
        { type: "image", attrs: { src: "image.png", custom: "preserved" } },
      ],
    };
    const fieldValues = { employee_name: "أحمد" };
    const content = applyFieldValues(rich, fieldValues);

    await caller.createDocument({
      ...documentInput,
      content,
      fieldValues,
      templateId: template.id,
      templateRevision: template.revision,
    });

    expect(content).toEqual({
      ...rich,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "أحمد", marks: [{ type: "bold" }] }],
        },
        rich.content[1],
      ],
    });
    expect(mocks.createOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({
        content,
        fieldValues,
        templateFieldsSnapshot: fields,
      })
    );
  });

  it("rejects malformed legacy and unknown root content before writing", async () => {
    const caller = documentStudioRouter.createCaller(context());
    for (const content of [
      { type: "legacy-html", html: 42 },
      { type: "legacy-text", text: null },
      { type: "unknown", text: "preserve" },
      { type: "doc", content: [{ type: "text" }] },
      { type: "doc", content: [{ type: "paragraph", content: [null] }] },
    ]) {
      await expect(
        caller.createDocument({ ...documentInput, content })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.createOfficialDocument).not.toHaveBeenCalled();
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
    expect(dbMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.issue" })
    );
    expect(saved.document.status).toBe("issued");
    expect(saved.auditLogRecorded).toBe(true);
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

  it("lists only the authenticated owner's document versions", async () => {
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.listDocumentVersions({ id: document.id });

    expect(mocks.listOfficialDocumentVersions).toHaveBeenCalledWith(
      ownerId,
      document.id
    );
    expect(result).toEqual([
      {
        version: 1,
        savedAt: timestamp,
        savedByUserId: ownerId,
        title: "عنوان سابق",
      },
    ]);
  });

  it("restores a previous draft version with optimistic concurrency", async () => {
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.restoreDocumentVersion({
      id: document.id,
      version: 1,
      expectedUpdatedAt: timestamp,
    });

    expect(mocks.restoreOfficialDocumentVersion).toHaveBeenCalledWith(
      ownerId,
      document.id,
      1,
      timestamp
    );
    expect(result).toMatchObject({
      id: document.id,
      title: "عنوان سابق",
    });
  });

  it("audits an owned document deletion and reports successful cleanup", async () => {
    mocks.deleteOfficialDocument.mockResolvedValueOnce(document);
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.deleteDocument({ id: document.id });

    expect(mocks.deleteOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      document.id
    );
    expect(dbMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 7,
        action: "document.deleted",
        entityType: "document",
        entityId: document.id,
        metadata: expect.objectContaining({
          title: document.title,
          fileCleanupSucceeded: true,
        }),
      })
    );
    expect(result).toEqual({
      success: true,
      auditLogRecorded: true,
      fileCleanupSucceeded: true,
    });
  });

  it("reports failed attachment cleanup without hiding the deletion result", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const documentWithFile = {
      ...document,
      file: {
        storageKey: uploadedStorageKey,
        fileName: uploadedFileName,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: uploadBytes.length,
        pageCount: 1,
      },
    };
    mocks.deleteOfficialDocument.mockResolvedValueOnce(documentWithFile);
    storageMocks.remove.mockRejectedValueOnce(new Error("storage unavailable"));
    const caller = documentStudioRouter.createCaller(context());

    try {
      const result = await caller.deleteDocument({ id: document.id });
      expect(result).toEqual({
        success: true,
        auditLogRecorded: true,
        fileCleanupSucceeded: false,
      });
      expect(storageMocks.remove).toHaveBeenCalledWith(uploadedStorageKey);
      expect(dbMocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "document.deleted",
          metadata: expect.objectContaining({
            fileCleanupSucceeded: false,
          }),
        })
      );
    } finally {
      logError.mockRestore();
    }
  });

  it("reports an audit-log failure after a successful deletion", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteOfficialDocument.mockResolvedValueOnce(document);
    dbMocks.writeAuditLog.mockRejectedValueOnce(new Error("audit unavailable"));
    const caller = documentStudioRouter.createCaller(context());

    try {
      const result = await caller.deleteDocument({ id: document.id });
      expect(result).toEqual({
        success: true,
        auditLogRecorded: false,
        fileCleanupSucceeded: true,
      });
    } finally {
      logError.mockRestore();
    }
  });

  it("archives without physically deleting the owned document and reports audit status", async () => {
    const caller = documentStudioRouter.createCaller(context());

    const result = await caller.archiveDocument({
      id: document.id,
      expectedUpdatedAt: timestamp,
    });

    expect(mocks.archiveOfficialDocument).toHaveBeenCalledWith(
      ownerId,
      document.id,
      timestamp
    );
    expect(result.document.status).toBe("archived");
    expect(result.auditLogRecorded).toBe(true);
    expect(dbMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.archive" })
    );
  });

  it("reports a successful archive when audit logging fails", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    dbMocks.writeAuditLog.mockRejectedValueOnce(new Error("audit unavailable"));
    const caller = documentStudioRouter.createCaller(context());

    try {
      const result = await caller.archiveDocument({
        id: document.id,
        expectedUpdatedAt: timestamp,
      });
      expect(result.document.status).toBe("archived");
      expect(result.auditLogRecorded).toBe(false);
    } finally {
      logError.mockRestore();
    }
  });

  it("reports issuance success separately from an audit-log failure", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    dbMocks.writeAuditLog.mockRejectedValueOnce(new Error("audit unavailable"));
    const caller = documentStudioRouter.createCaller(context());

    try {
      const result = await caller.issueDocument({
        id: document.id,
        expectedUpdatedAt: timestamp,
      });
      expect(result.document.status).toBe("issued");
      expect(result.document.serialCode).toBe("DOC-00012");
      expect(result.auditLogRecorded).toBe(false);
    } finally {
      logError.mockRestore();
    }
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
    await expect(
      caller.listDocumentVersions({ id: document.id })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.restoreDocumentVersion({
        id: document.id,
        version: 1,
        expectedUpdatedAt: timestamp,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.listOfficialDocuments).not.toHaveBeenCalled();
    expect(mocks.createDocumentTemplate).not.toHaveBeenCalled();
  });
});
