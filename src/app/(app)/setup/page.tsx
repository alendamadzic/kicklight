import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Setup",
};

export default function SetupPage() {
  return <SettingsView />;
}
