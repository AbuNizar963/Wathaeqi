import type { DocumentSortOrder, DocumentStatusFilter } from "./libraryFilters";

type DocumentLibraryStatusControlsProps = {
  status: DocumentStatusFilter;
  sort: DocumentSortOrder;
  onStatusChange: (status: DocumentStatusFilter) => void;
  onSortChange: (sort: DocumentSortOrder) => void;
};

export default function DocumentLibraryStatusControls({
  status,
  sort,
  onStatusChange,
  onSortChange,
}: DocumentLibraryStatusControlsProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3">
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        حالة الوثيقة
        <select
          value={status}
          onChange={event =>
            onStatusChange(event.target.value as DocumentStatusFilter)
          }
          className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
        >
          <option value="all">جميع الحالات</option>
          <option value="draft">مسودات</option>
          <option value="issued">صادرة</option>
          <option value="archived">مؤرشفة</option>
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        ترتيب النتائج
        <select
          value={sort}
          onChange={event =>
            onSortChange(event.target.value as DocumentSortOrder)
          }
          className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
        >
          <option value="updated-desc">الأحدث تحديثاً</option>
          <option value="updated-asc">الأقدم تحديثاً</option>
          <option value="title-asc">العنوان أبجدياً</option>
        </select>
      </label>
    </div>
  );
}
