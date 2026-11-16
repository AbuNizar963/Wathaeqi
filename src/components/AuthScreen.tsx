import { useState, type FormEvent } from "react";
import { FileText, LockKeyhole, Mail, UserRound } from "lucide-react";
import { appwriteConfigured } from "../lib/appwrite";
import { signIn, signUp } from "../lib/documentRepository";

type Props = { onAuthenticated: (name: string) => void };

export default function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = mode === "signup"
        ? await signUp(name, email, password)
        : await signIn(email, password);
      onAuthenticated(user.name || user.email);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" dir="rtl">
      <section className="auth-card">
        <div className="auth-brand"><span><FileText size={25}/></span><div><strong>وثائقي</strong><small>إدارة الوثائق الرسمية</small></div></div>
        <h1>{mode === "signin" ? "مرحباً بعودتك" : "إنشاء حساب جديد"}</h1>
        <p className="auth-description">سجّل الدخول للوصول إلى مستنداتك المحفوظة بأمان.</p>
        {!appwriteConfigured && <div className="auth-error">إعدادات Appwrite غير مكتملة. أضف متغيرات البيئة المطلوبة في Netlify أولاً.</div>}
        <form onSubmit={submit}>
          {mode === "signup" && <label className="auth-field"><span>الاسم</span><div><UserRound size={17}/><input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="اسم المستخدم"/></div></label>}
          <label className="auth-field"><span>البريد الإلكتروني</span><div><Mail size={17}/><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com"/></div></label>
          <label className="auth-field"><span>كلمة المرور</span><div><LockKeyhole size={17}/><input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="8 أحرف على الأقل"/></div></label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !appwriteConfigured}>{busy ? "جارٍ المعالجة..." : mode === "signin" ? "تسجيل الدخول" : "إنشاء الحساب"}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
          {mode === "signin" ? "ليس لديك حساب؟ إنشاء حساب جديد" : "لديك حساب بالفعل؟ تسجيل الدخول"}
        </button>
      </section>
    </main>
  );
}
