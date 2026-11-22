import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getRequestAuditContext } from "../../auditContext";
import {
  getPlatformDocumentSettings,
  updatePlatformDocumentSettings,
  writeAuditLog,
} from "../../db";
import { isPlatformOwner } from "../../ownerAccess";
import { protectedProcedure, router } from "../../_core/trpc";
import {
  HEX_COLOR_PATTERN,
  MAX_HEADER_LOGO_SIZE,
  MAX_HEADER_PADDING_MM,
  MAX_PAGE_MARGIN_MM,
  MAX_WATERMARK_OPACITY_PERCENT,
  MAX_DIVIDER_WIDTH_PT,
  MAX_FRAME_WIDTH_PT,
  MIN_DIVIDER_WIDTH_PT,
  MIN_FRAME_WIDTH_PT,
  MIN_HEADER_LOGO_SIZE,
  type PlatformDocumentSettings,
} from "../../../shared/features/platform-settings/platformDocumentSettings";

const platformDocumentSettingsInput = z.object({
  showMinistryWatermarkText: z.boolean(),
  watermarkText: z.string().max(255),
  watermarkOpacityPercent: z
    .number()
    .int()
    .min(0)
    .max(MAX_WATERMARK_OPACITY_PERCENT),
  headerDividerColor: z.string().regex(HEX_COLOR_PATTERN),
  headerDividerStyle: z.enum([
    "solid",
    "double",
    "dashed",
    "dotted",
    "tricolor-stars",
  ]),
  headerDividerWidthPt: z
    .number()
    .min(MIN_DIVIDER_WIDTH_PT)
    .max(MAX_DIVIDER_WIDTH_PT),
  headerTitle: z.string().max(255),
  headerSubtitle: z.string().max(255),
  headerChiefRank: z.string().max(120),
  headerChiefName: z.string().max(255),
  headerShowLogo: z.boolean(),
  headerLogoSize: z
    .number()
    .int()
    .min(MIN_HEADER_LOGO_SIZE)
    .max(MAX_HEADER_LOGO_SIZE),
  headerTopPaddingMm: z.number().int().min(0).max(MAX_HEADER_PADDING_MM),
  headerHorizontalPaddingMm: z.number().int().min(0).max(MAX_HEADER_PADDING_MM),
  headerBottomPaddingMm: z.number().int().min(0).max(MAX_HEADER_PADDING_MM),
  headerAlignment: z.enum(["spread", "center", "right"]),
  pageMarginTopMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
  pageMarginRightMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
  pageMarginBottomMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
  pageMarginLeftMm: z.number().int().min(0).max(MAX_PAGE_MARGIN_MM),
  frameStyle: z.enum(["none", "single", "double", "ornate"]),
  frameColor: z.string().regex(HEX_COLOR_PATTERN),
  frameWidthPt: z.number().min(MIN_FRAME_WIDTH_PT).max(MAX_FRAME_WIDTH_PT),
  showVerificationQr: z.boolean(),
});

export const platformDocumentSettingsRouter = router({
  get: protectedProcedure.query(() => getPlatformDocumentSettings()),

  update: protectedProcedure
    .input(platformDocumentSettingsInput)
    .mutation(async ({ ctx, input }) => {
      if (!isPlatformOwner(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "إعدادات النظام متاحة لمالك المنصة فقط",
        });
      }

      const settings: Omit<PlatformDocumentSettings, "updatedAt"> = input;
      const saved = await updatePlatformDocumentSettings(settings, ctx.user.id);
      await writeAuditLog({
        ...getRequestAuditContext(ctx.req),
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email ?? "Platform owner",
        action: "platform.document_settings.update",
        entityType: "platform_document_settings",
        entityId: "1",
        metadata: JSON.stringify(input),
      });
      return saved;
    }),
});
