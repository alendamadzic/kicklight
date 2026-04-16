"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot, type StatusDotStatus } from "@/components/ui/StatusDot";

export function Header({
  bridgeStatus = "disconnected",
}: {
  bridgeStatus?: StatusDotStatus;
}) {
  const { setTheme } = useTheme();

  return (
    <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        kicklight.
      </h1>
      <div className="flex items-center gap-4">
        <StatusDot
          status={bridgeStatus}
          label={bridgeStatus === "connected" ? "Bridge" : "No bridge"}
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="size-4" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="size-4" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="size-4" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
