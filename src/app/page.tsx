import { AppShell } from "@/components/AppShell";
import { readConfig } from "@/lib/config";

export default async function Home() {
  const config = await readConfig();
  return <AppShell initialConfig={config} />;
}
