"use client";

import { useCallback, useState } from "react";
import { reconfigureBridge } from "@/actions/hue";
import { Header } from "@/components/layout/Header";
import { StatusBar } from "@/components/layout/StatusBar";
import { ActiveMatch } from "@/components/match/ActiveMatch";
import { MatchSelector } from "@/components/match/MatchSelector";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { ShowcaseButton } from "@/components/showcase/ShowcaseButton";
import { ShowcaseModal } from "@/components/showcase/ShowcaseModal";
import type { KicklightConfig, Match } from "@/types";

function isConfigComplete(
  config: KicklightConfig | null,
): config is KicklightConfig {
  return !!(config?.bridgeIp && config?.username && config?.lightId);
}

export function AppShell({
  initialConfig,
}: {
  initialConfig: KicklightConfig | null;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState(
    isConfigComplete(initialConfig),
  );
  const [nextPollTime, setNextPollTime] = useState<Date | undefined>();
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [showShowcase, setShowShowcase] = useState(false);

  const handleSetupComplete = useCallback((newConfig: KicklightConfig) => {
    setConfig(newConfig);
    setBridgeConnected(true);
  }, []);

  const handleStopMatch = useCallback(() => {
    setActiveMatch(null);
    setNextPollTime(undefined);
    setRateLimitWarning(false);
  }, []);

  const handleReconfigure = useCallback(async () => {
    await reconfigureBridge();
    setConfig(null);
    setActiveMatch(null);
    setBridgeConnected(false);
  }, []);

  const setupNeeded = !isConfigComplete(config);

  return (
    <div className="flex min-h-screen flex-col">
      <Header bridgeStatus={bridgeConnected ? "connected" : "disconnected"} />

      <main className="flex flex-1 flex-col px-6 pb-14">
        {setupNeeded ? (
          <SetupWizard onComplete={handleSetupComplete} />
        ) : activeMatch ? (
          <ActiveMatch
            match={activeMatch}
            config={config}
            onStop={handleStopMatch}
            onNextPollTime={setNextPollTime}
            onRateLimitWarning={setRateLimitWarning}
            onBridgeStatusChange={setBridgeConnected}
            onReconfigure={handleReconfigure}
          />
        ) : (
          <MatchSelector onSelectMatch={setActiveMatch} />
        )}
      </main>

      <ShowcaseButton onClick={() => setShowShowcase(true)} />

      {showShowcase && <ShowcaseModal onClose={() => setShowShowcase(false)} />}

      <StatusBar
        bridgeIp={config?.bridgeIp}
        lightName={config?.lightName}
        nextPollTime={nextPollTime}
        bridgeStatus={bridgeConnected ? "connected" : "disconnected"}
        rateLimitWarning={rateLimitWarning}
        onReconfigure={handleReconfigure}
      />
    </div>
  );
}
