import { Suspense } from "react";
import { AppChrome } from "@/components/chrome/app-chrome";
import { ViewerSeed } from "@/components/data/viewer-seed";
import { getViewer } from "@/server/viewer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppChrome>{children}</AppChrome>
      <Suspense fallback={null}>
        <Viewer />
      </Suspense>
    </>
  );
}

/** Streams who is signed in, their preferences and live session into the client stores. */
async function Viewer() {
  const viewer = await getViewer();
  if (!viewer) return null;
  return (
    <ViewerSeed
      user={viewer.user}
      preferences={viewer.preferences}
      session={viewer.session}
    />
  );
}
