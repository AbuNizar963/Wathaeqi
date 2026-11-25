import {
  Archive,
  FilePlus2,
  FileText,
  FolderOpen,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function WorkspaceWelcome({
  documents,
  templates,
  archived,
  onCreate,
  onTemplates,
  onFiles,
}: {
  documents: number;
  templates: number;
  archived: number;
  onCreate: () => void;
  onTemplates: () => void;
  onFiles: () => void;
}) {
  return (
    <Card className="workspace-welcome gap-6 p-6 sm:p-8">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <FileText className="size-7" />
      </span>
      <div>
        <p className="document-section-label">من المسودة إلى الأرشيف</p>
        <h2 className="mt-2 text-xl font-bold">كل وثيقة تبدأ بخطوة واضحة</h2>
        <p className="mt-2 max-w-lg text-sm leading-7 text-muted-foreground">
          اختر وثيقة من القائمة لمتابعة العمل، أو أنشئ وثيقة جديدة، أو استخدم
          قالباً جاهزاً. ملفاتك المستوردة متاحة في المكان نفسه.
        </p>
      </div>
      <dl className="flex flex-wrap gap-6 border-y py-4">
        {[
          { label: "الوثائق", value: documents, Icon: FileText },
          { label: "القوالب", value: templates, Icon: LayoutTemplate },
          { label: "الأرشيف", value: archived, Icon: Archive },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="min-w-20">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {value.toLocaleString("ar")}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreate}>
          <FilePlus2 className="size-4" /> إنشاء وثيقة
        </Button>
        <Button variant="outline" onClick={onTemplates}>
          <LayoutTemplate className="size-4" /> استخدام قالب
        </Button>
        <Button variant="outline" onClick={onFiles}>
          <FolderOpen className="size-4" /> إدارة الملفات
        </Button>
      </div>
    </Card>
  );
}
