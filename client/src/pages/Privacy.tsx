import { useLocation } from "wouter";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/BrandMark";

const sections = [
  {
    title: "1. نطاق هذه السياسة",
    paragraphs: [
      "توضح هذه السياسة كيفية تعامل نظام وثائقي مع المعلومات اللازمة لتشغيل الحسابات وإعداد الوثائق وحفظها وطباعتها. تسري على استخدام النظام عبر الويب وتطبيق الهاتف.",
      "وظائف النظام مخصصة لإنشاء الوثائق وتحريرها ومعاينتها وحفظها وتنزيلها وطباعتها. لا يتضمن النظام مسارات لإرسال الوثائق أو استقبالها.",
    ],
  },
  {
    title: "2. المعلومات التي قد يعالجها النظام",
    paragraphs: [
      "بيانات الحساب والتعريف، مثل اسم المستخدم ومعرّف الحساب والدور والصلاحيات ومعلومات الجلسة اللازمة لتسجيل الدخول.",
      "محتوى الوثائق وبياناتها الوصفية، مثل العنوان والتصنيف والتاريخ والحقول المدخلة، إضافة إلى الملفات الأصلية أو المرفقات التي يختار المستخدم حفظها في النظام.",
      "بيانات تشغيلية وأمنية مرتبطة باستخدام النظام، مثل وقت بعض العمليات والحساب الذي نفذها وسجلات التدقيق، بالقدر الذي تتيحه وظائف النظام وإعداداته.",
    ],
  },
  {
    title: "3. أغراض المعالجة",
    paragraphs: [
      "تُستخدم المعلومات للتحقق من هوية المستخدم وتطبيق صلاحياته، وتوفير وظائف إنشاء الوثائق وتحريرها ومعاينتها وحفظها وطباعتها وتنزيلها.",
      "قد تُستخدم سجلات التشغيل والتدقيق لمراجعة التغييرات، والتحقق من سلامة الاستخدام، ومعالجة الأعطال والحوادث الأمنية، والوفاء بمتطلبات الجهة المالكة.",
      "لا تُستخدم بيانات الوثائق لأغراض الإعلان أو بيعها.",
    ],
  },
  {
    title: "4. الوصول والمشاركة",
    paragraphs: [
      "يخضع الوصول إلى الحسابات والوثائق للصلاحيات المعتمدة داخل النظام. ينبغي ألا يطّلع على المعلومات إلا المستخدمون المخولون ولأغراض العمل المصرح بها.",
      "قد تتم معالجة البيانات بواسطة مزودي البنية التحتية والخدمات التقنية اللازمة لاستضافة النظام وتشغيله، وفق إعدادات المشروع والتزامات الجهة المالكة. ولا ينبغي نقل الوثائق إلى خدمات أو أطراف أخرى إلا بتفويض من الجهة المختصة.",
    ],
  },
  {
    title: "5. الحفظ والاحتفاظ والحذف",
    paragraphs: [
      "تُحفظ الوثائق والبيانات التشغيلية ضمن خدمات التخزين المعتمدة للمشروع. وتحدد الجهة المالكة مدد الاحتفاظ وإجراءات الأرشفة والحذف وفق المتطلبات القانونية وسياساتها الداخلية.",
      "لا تحذف الوثائق أو السجلات الرسمية إلا من خلال الصلاحيات والإجراءات المعتمدة. ويمكن للمستخدم توجيه طلبات التصحيح أو الحذف إلى مسؤول النظام أو الجهة المخولة.",
    ],
  },
  {
    title: "6. مسؤولية المستخدم",
    paragraphs: [
      "على المستخدم حماية بيانات دخوله وأجهزته، والتحقق من صحة الوثائق قبل حفظها أو طباعتها، وعدم إدخال معلومات لا يملك صلاحية استخدامها.",
      "يجب الإبلاغ إلى مسؤول النظام عن فقدان بيانات الدخول أو الاشتباه بوصول غير مصرح به أو كشف معلومات أو خلل قد يؤثر في سرية البيانات أو سلامتها.",
    ],
  },
  {
    title: "7. التحديثات والاستفسارات",
    paragraphs: [
      "قد تُحدّث هذه السياسة عند تغير وظائف النظام أو متطلبات التشغيل أو التعليمات المعتمدة. وتُعرض النسخة السارية داخل النظام.",
      "للاستفسار عن البيانات أو طلب تصحيحها أو ممارسة الحقوق المتعلقة بها، يُرجى التواصل مع مسؤول النظام أو الجهة المالكة عبر القنوات الرسمية المعتمدة.",
    ],
  },
];

export default function Privacy() {
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
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">
            إعدادات النظام
          </p>
          <h1 className="text-2xl font-bold tracking-tight">سياسة الخصوصية</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            توضيح موجز للمعلومات التي يعالجها وثائقي وكيفية استخدامها وحمايتها.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>سياسة الخصوصية وحماية المعلومات</CardTitle>
              <CardDescription>
                تنطبق على الحسابات والوثائق والبيانات التشغيلية في نظام وثائقي.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-7 p-5 sm:p-7">
          {sections.map(section => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-base font-bold text-foreground">
                {section.title}
              </h2>
              {section.paragraphs.map(paragraph => (
                <p
                  key={paragraph}
                  className="text-sm leading-8 text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          <p className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
            هذه السياسة وصف تشغيلي عام، ولا تحل محل المتطلبات القانونية أو سياسات
            حماية البيانات المعتمدة لدى الجهة المالكة.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
