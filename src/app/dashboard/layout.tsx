"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AdminProvider, useAdmin } from "@/lib/admin-context";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  MessageSquare,
  LogOut,
  Wrench,
  Building2,
  Users,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Chat", href: "/dashboard/chat", icon: MessageSquare },
];

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { adminDetails, loading: adminLoading } = useAdmin();

  if (!user) return null;

  const adminType = adminDetails?.administeredEntity?.administeredEntityType;
  const entityName = adminDetails?.administeredEntity?.name;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r">
        <div className="flex h-16 items-center gap-2 px-6 border-b">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-sm">FD MCP Server Explorer</span>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          {navigation.map((item) => (
            <Link key={item.name} href={item.href}>
              <Button variant="ghost" className="w-full justify-start gap-2">
                <item.icon className="h-4 w-4" />
                {item.name}
              </Button>
            </Link>
          ))}
        </nav>

        {/* Admin context info */}
        {!adminLoading && adminDetails && (
          <div className="mx-4 p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 mb-1">
              {adminType === "PARTNER" ? (
                <Users className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-muted-foreground">
                {adminType === "PARTNER" ? "Partner Admin" : "Org Admin"}
              </span>
            </div>
            <p className="text-sm font-medium truncate" title={entityName}>
              {entityName}
            </p>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || ""}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-medium">
                  {user.email?.[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <AdminProvider>
      <DashboardContent>{children}</DashboardContent>
    </AdminProvider>
  );
}
