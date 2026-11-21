import {
  FileText,
  Info,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  SunMoon,
  UserRound,
  Users,
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
import { trpc } from "@/lib/trpc";
import {
  getManagementMenuHeading,
  hasOrganizationSettingsMenuAccess,
  hasUserManagementMenuAccess,
} from "@/features/admin/menuAccess";

export default function HeaderActions() {
  const { preference, setThemePreference } = useTheme();
  const { user, logout } = useAuth();
  const organizationContext = trpc.organizations.context.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const isPlatformOwner =
    user?.isPlatformOwner === true ||
    organizationContext.data?.isOwner === true;
  const canManageOrganizationSettings = hasOrganizationSettingsMenuAccess({
    organizationRole: organizationContext.data?.role,
    isPlatformOwner,
  });
  const canManageUsers = hasUserManagementMenuAccess({
    accountRole: user?.role,
    organizationRole: organizationContext.data?.role,
    isPlatformOwner,
  });
  const managementMenuHeading = getManagementMenuHeading(
    user?.role,
    isPlatformOwner
  );

  if (!user) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="flex items-center gap-2"
      aria-label="إجراءات الصفحة"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="مظهر الواجهة"
            title="إعدادات المظهر"
            className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur hover:bg-accent"
          >
            <SunMoon className="h-[18px] w-[18px]" />
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="الإعدادات"
            title="الإعدادات"
            className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur hover:bg-accent"
          >
            <Menu className="h-[19px] w-[19px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuItem
            onSelect={() => {
              window.location.href = "/profile";
            }}
            className="cursor-pointer justify-end gap-2"
          >
            <UserRound className="h-4 w-4" />
            <span>الملف الشخصي</span>
          </DropdownMenuItem>
          {canManageOrganizationSettings ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-right text-xs font-bold text-muted-foreground">
                إعدادات الجهة
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-department-settings")
                  )
                }
                className="cursor-pointer justify-end gap-2"
              >
                <Settings className="h-4 w-4" />
                <span>إعدادات الجهة</span>
              </DropdownMenuItem>
            </>
          ) : null}
          {canManageUsers ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-right text-xs font-bold text-muted-foreground">
                {managementMenuHeading}
              </DropdownMenuLabel>
              {isPlatformOwner ? (
                <DropdownMenuItem
                  onSelect={() => {
                    window.location.href = "/settings";
                  }}
                  className="cursor-pointer justify-end gap-2"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>إعدادات الوثائق</span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-owner-user-management")
                  )
                }
                className="cursor-pointer justify-end gap-2"
              >
                <Users className="h-4 w-4" />
                <span>الحسابات والصلاحيات</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-owner-organization-management")
                  )
                }
                className="cursor-pointer justify-end gap-2"
              >
                <Users className="h-4 w-4" />
                <span>إدارة الجهات</span>
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              window.location.href = "/terms";
            }}
            className="cursor-pointer justify-end gap-2"
          >
            <FileText className="h-4 w-4" />
            <span>الشروط والأحكام</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              window.location.href = "/about";
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
    </div>
  );
}
