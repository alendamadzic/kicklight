import type { Metadata } from "next";
import { RemoteTab } from "@/components/remote/remote-tab";

export const metadata: Metadata = {
  title: "Remote",
};

export default function RemotePage() {
  return <RemoteTab />;
}
