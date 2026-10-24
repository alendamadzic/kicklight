import { AppChrome } from "@/components/chrome/app-chrome";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
