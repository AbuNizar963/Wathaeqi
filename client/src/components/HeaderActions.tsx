import {
  Download,
  FileText,
  Info,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Sun,
  SunMoon,
  UserRound,
} from "lucide-react";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth-session/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { usePwaInstall } from "@/contexts/PwaInstallContext";

export default function HeaderActions({
  showTheme = true,
  showMenu = true,
}: {
  showTheme?: boolean;
  showMenu?: boolean;
}) {
  const { preference, setThemePreference } = useTheme();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { canInstall, installApp } = usePwaInstall();

  const handleInstall = async () => {
    try {
      const outcome = await installApp();
      if (outcome === "accepted") {
        toast.info("قبل المتصفح طلب التثبيت. أكمل خطوات التثبيت الظاهرة.");
      } else if (outcome === "dismissed") {
        toast.info("لم يتم تثبيت التطبيق.");
      }
    } catch {
      toast.error("تعذر بدء تثبيت وثائقي. حاول مرة أخرى من المتصفح.");
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="flex items-center gap-2"
      aria-label="إجراءات الصفحة"
    >
      {showTheme ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="مظهر الواجهة"
              title="إعدادات المظهر"
              className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur transition-colors hover:bg-accent"
            >
              <SunMoon className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56">
            <DropdownMenuLabel className="text-right text-xs font-bold text-muted-foreground">
              مظهر الواجهة
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preference}
              onValueChange={value =>
                setThemePreference(value as ThemePreference)
              }
            >
              <DropdownMenuRadioItem
                value="system"
                className="cursor-pointer justify-end gap-2"
              >
                <Monitor className="h-4 w-4" />
                <span>تلقائي حسب الجهاز</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="light"
                className="cursor-pointer justify-end gap-2"
              >
                <Sun className="h-4 w-4" />
                <span>الوضع الفاتح</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="dark"
                className="cursor-pointer justify-end gap-2"
              >
                <Moon className="h-4 w-4" />
                <span>الوضع الداكن</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="الحساب والمساعدة"
              title="الحساب والمساعدة"
              className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur transition-colors hover:bg-accent"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-64">
            <DropdownMenuLabel className="text-right text-xs font-bold text-muted-foreground">
              الحساب والمساعدة
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setLocation("/profile");
              }}
              className="cursor-pointer justify-end gap-2"
            >
              <UserRound className="h-4 w-4" />
              <span>الملف الشخصي</span>
            </DropdownMenuItem>
            {canInstall ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void handleInstall()}
                  className="cursor-pointer justify-end gap-2"
                >
                  <Download className="h-4 w-4" />
                  <span>تثبيت التطبيق</span>
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setLocation("/terms");
              }}
              className="cursor-pointer justify-end gap-2"
            >
              <FileText className="h-4 w-4" />
              <span>الشروط والأحكام</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setLocation("/about");
              }}
              className="cursor-pointer justify-end gap-2"
            >
              <Info className="h-4 w-4" />
              <span>حول النظام وميزاته</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void logout()}
              className="cursor-pointer justify-end gap-2 text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>تسجيل الخروج</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
