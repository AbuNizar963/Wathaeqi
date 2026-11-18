import { LogOut, SunMoon, UserRound } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth-session/useAuth";

export default function HeaderActions() {
  const { preference, setThemePreference } = useTheme();
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="flex items-center gap-2"
      aria-label="إجراءات الحساب"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="تبديل مظهر الواجهة"
        title="تبديل مظهر الواجهة"
        className="h-10 w-10 rounded-xl"
        onClick={() =>
          setThemePreference(preference === "dark" ? "light" : "dark")
        }
      >
        <SunMoon className="h-[18px] w-[18px]" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="الملف الشخصي"
        title="الملف الشخصي"
        className="h-10 w-10 rounded-xl"
        onClick={() => {
          window.location.href = "/profile";
        }}
      >
        <UserRound className="h-[18px] w-[18px]" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="تسجيل الخروج"
        title="تسجيل الخروج"
        className="h-10 w-10 rounded-xl"
        onClick={() => void logout()}
      >
        <LogOut className="h-[18px] w-[18px]" />
      </Button>
    </div>
  );
}
