import type { Metadata } from "next";
import { DemoView } from "@/components/demo/DemoView";

export const metadata: Metadata = {
  title: "Demo",
  description:
    "Play a scripted match and watch the strip react. No bridge needed.",
};

export default function DemoPage() {
  return <DemoView />;
}
