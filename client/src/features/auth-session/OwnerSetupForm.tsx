import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";
import { trpc } from "@/lib/trpc";

export default function OwnerSetupForm() {
  const utils = trpc.useUtils();
  const createOwner = trpc.auth.createInitialOwner.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.auth.me.invalidate(),
        utils.auth.ownerSetupStatus.invalidate(),
      ]);
    },
  });
  const [setupSecret, setSetupSecret] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12 || password !== confirmPassword) return;
    createOwner.mutate({ setupSecret, name, username, email, password });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <form
        className="surface-elevated flex w-full max-w-lg flex-col gap-5 rounded-[1.5rem] border bg-card/95 p-6 shadow-lg backdrop-blur sm:p-8"
        onSubmit={submit}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="lg" />
          <h1 className="text-2xl font-semibold tracking-tight">
            إنشاء حساب مالك النظام
          </h1>
          <p className="text-sm text-muted-foreground">
            هذه خطوة الإعداد الأولى. أنشئ حساب المالك الذي سيملك صلاحيات إدارة النظام.
            بعد نجاح الإنشاء سيُغلق هذا الإعداد تلقائياً.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="owner-setup-secret" className="text-sm font-medium">
            رمز الإعداد الأولي
          </label>
          <Input
            id="owner-setup-secret"
            type="password"
            value={setupSecret}
            onChange={event => setSetupSecret(event.target.value)}
            autoComplete="off"
            dir="ltr"
            required
          />
          <p className="text-xs text-muted-foreground">
            الرمز الذي أعددته في متغير OWNER_SETUP_SECRET داخل Netlify.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="owner-name" className="text-sm font-medium">
              الاسم الكامل
            </label>
            <Input
              id="owner-name"
              value={name}
              onChange={event => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="owner-username" className="text-sm font-medium">
              اسم المستخدم
            </label>
            <Input
              id="owner-username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              dir="ltr"
              minLength={3}
              pattern="[A-Za-z0-9._-]+"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="owner-email" className="text-sm font-medium">
            البريد الإلكتروني
          </label>
          <Input
            id="owner-email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoComplete="email"
            dir="ltr"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="owner-password" className="text-sm font-medium">
              كلمة المرور
            </label>
            <Input
              id="owner-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              dir="ltr"
              minLength={12}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="owner-password-confirm" className="text-sm font-medium">
              تأكيد كلمة المرور
            </label>
            <Input
              id="owner-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              dir="ltr"
              minLength={12}
              required
            />
          </div>
        </div>

        {password && password.length < 12 ? (
          <p className="text-sm text-destructive" role="alert">
            يجب أن تتكون كلمة المرور من 12 خانة على الأقل.
          </p>
        ) : null}
        {confirmPassword && password !== confirmPassword ? (
          <p className="text-sm text-destructive" role="alert">
            كلمتا المرور غير متطابقتين.
          </p>
        ) : null}
        {createOwner.error ? (
          <p className="text-sm text-destructive" role="alert">
            {createOwner.error.message}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={
            createOwner.isPending ||
            setupSecret.length < 32 ||
            name.trim().length < 2 ||
            username.trim().length < 3 ||
            !email.trim() ||
            password.length < 12 ||
            password !== confirmPassword
          }
        >
          {createOwner.isPending ? "جارٍ إنشاء حساب المالك..." : "إنشاء حساب المالك"}
        </Button>
      </form>
    </div>
  );
}
