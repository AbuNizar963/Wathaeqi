import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/BrandMark";

const featureIconContainerClass =
  "flex h-10 w-10 items-center justify-center rounded-xl";
const sectionLabelClass =
  "text-xs font-semibold tracking-wide text-muted-foreground";

const features = [
  {
    icon: ShieldCheck,
    title: "أرشيف وثائقي موحّد",
    label: "Word وPDF في مكان واحد",
    description:
      "ارفع ملفات Word وPDF والصور، وأضف العنوان والتصنيف والتاريخ، ثم ابحث في المكتبة واسترجع أي وثيقة بسرعة.",
    tone: "text-info bg-info/10",
  },
  {
    icon: CheckCircle2,
    title: "طباعة بثلاثة توزيعات",
    label: "صفحة أو صفحتان أو أربع صفحات",
    description:
      "اختر عند الطباعة توزيع الصفحات على ورقة A4، مع ترويسة وتذييل وترقيم للأوراق، ثم اطبع أو احفظ PDF.",
    tone: "text-success bg-success/10",
  },
  {
    icon: Fingerprint,
    title: "تتبّع كامل للإجراءات",
    label: "سجل تدقيق واضح",
    description:
      "كل رفع أو حذف أو تعديل يُربط بالحساب والوقت، ليبقى الأرشيف قابلًا للمراجعة والمساءلة.",
    tone: "text-info bg-info/10",
  },
  {
    icon: LockKeyhole,
    title: "جلسة دخول مستمرة",
    label: "30 يومًا لكل مستخدم",
    description:
      "يبقى تسجيل الدخول فعالًا لمدة 30 يومًا، وينتهي فورًا عند اختيار تسجيل الخروج.",
    tone: "text-muted-foreground bg-muted",
  },
];

export default function About() {
  const [, navigate] = useLocation();

  return (
    <main
      dir="rtl"
      className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-12 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <BrandMark size="sm" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="العودة"
          onClick={() => navigate("/")}
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div>
          <p className={sectionLabelClass}>إعدادات النظام</p>
          <h1 className="text-2xl font-bold tracking-tight">حول النظام</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ميزات النظام التي تحافظ على موثوقية الوثائق وسلامة التشغيل.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/40">
          <CardTitle className="text-card-foreground">ميزات النظام</CardTitle>
          <CardDescription className="text-muted-foreground">
            أرشفة وطباعة وإدارة صلاحيات في مساحة عمل واحدة.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {features.map(feature => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`${featureIconContainerClass} ${feature.tone}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {feature.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {feature.label}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
