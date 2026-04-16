"use client";

import { Link, Loader2, Wifi } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  discoverBridge,
  getGradientLights,
  registerApp,
  saveConfig,
  testLightColor,
} from "@/actions/hue";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { HueLight, KicklightConfig } from "@/types";
import { LightSelector } from "./LightSelector";
import { SetupStep } from "./SetupStep";

type Step = 1 | 2 | 3 | 4;

export function SetupWizard({
  onComplete,
}: {
  onComplete: (config: KicklightConfig) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [bridgeIp, setBridgeIp] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [lights, setLights] = useState<HueLight[]>([]);
  const [selectedLight, setSelectedLight] = useState<HueLight | null>(null);
  const [pollInterval, setPollInterval] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingColor, setTestingColor] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const handleDiscover = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await discoverBridge();
    if ("ip" in result) {
      setBridgeIp(result.ip);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  // Step 1: Auto-discover bridge on mount
  useEffect(() => {
    if (step === 1 && !bridgeIp) {
      handleDiscover();
    }
  }, [step, bridgeIp, handleDiscover]);

  const handleRegister = useCallback(async () => {
    if (!bridgeIp) return;
    setLoading(true);
    setError(null);
    const result = await registerApp(bridgeIp);
    if ("username" in result) {
      setUsername(result.username);
      setStep(3);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [bridgeIp]);

  const handleLoadLights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getGradientLights();
      setLights(result);
    } catch {
      setError("Failed to load lights");
    }
    setLoading(false);
  }, []);

  // Load lights when entering step 3
  useEffect(() => {
    if (step === 3 && username) {
      handleLoadLights();
    }
  }, [step, username, handleLoadLights]);

  const handleTestColor = useCallback(
    async (hex: string) => {
      if (!bridgeIp || !username || !selectedLight) return;
      setTestingColor(hex);
      setTestError(null);
      const result = await testLightColor(
        bridgeIp,
        username,
        selectedLight.id,
        hex,
      );
      if (result.error) {
        setTestError(result.error);
      } else {
        setTestSuccess(hex);
        setTimeout(() => setTestSuccess(null), 1500);
      }
      setTestingColor(null);
    },
    [bridgeIp, username, selectedLight],
  );

  const handleFinish = useCallback(async () => {
    if (!bridgeIp || !username || !selectedLight) return;
    setLoading(true);
    const config: KicklightConfig = {
      bridgeIp,
      username,
      lightId: selectedLight.id,
      lightName: selectedLight.name,
      pollIntervalSeconds: pollInterval,
    };
    await saveConfig(config);
    setLoading(false);
    onComplete(config);
  }, [bridgeIp, username, selectedLight, pollInterval, onComplete]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight">
            kicklight.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Let&apos;s connect your Hue bridge
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  s <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Step {step} of 4</p>
        </div>

        {step === 1 && (
          <SetupStep
            title="Discover Bridge"
            description="Searching for a Philips Hue Bridge on your local network."
            footer={
              <>
                {error && (
                  <Button variant="outline" onClick={handleDiscover}>
                    Retry
                  </Button>
                )}
                {bridgeIp && <Button onClick={() => setStep(2)}>Next</Button>}
              </>
            }
          >
            <div className="flex flex-col items-center gap-3 py-4">
              {loading ? (
                <>
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Searching...</p>
                </>
              ) : error ? (
                <>
                  <Wifi className="size-8 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </>
              ) : bridgeIp ? (
                <>
                  <Wifi className="size-8 text-emerald-500" />
                  <p className="text-sm">
                    Found bridge at{" "}
                    <span className="font-mono font-medium">{bridgeIp}</span>
                  </p>
                </>
              ) : null}
            </div>
          </SetupStep>
        )}

        {step === 2 && (
          <SetupStep
            title="Connect"
            description="Press the physical link button on your Hue Bridge, then click below."
            footer={
              <Button onClick={handleRegister} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link className="size-4" />
                    I&apos;ve pressed it
                  </>
                )}
              </Button>
            }
          >
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                <Link className="size-8 text-primary" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                The link button is the large round button on top of the bridge.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </SetupStep>
        )}

        {step === 3 && (
          <SetupStep
            title="Select Light"
            description="Choose a gradient-capable light strip to control."
            footer={
              <Button onClick={() => setStep(4)} disabled={!selectedLight}>
                Next
              </Button>
            }
          >
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="py-4 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleLoadLights}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <LightSelector
                lights={lights}
                selectedId={selectedLight?.id ?? null}
                onSelect={setSelectedLight}
              />
            )}
          </SetupStep>
        )}

        {step === 4 && (
          <SetupStep
            title="Settings"
            description="Configure how often kicklight. checks for match updates."
            footer={
              <Button onClick={handleFinish} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Finish setup"
                )}
              </Button>
            }
          >
            <div className="flex flex-col gap-6 py-2">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Polling interval</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {pollInterval}s
                  </span>
                </div>
                <Slider
                  min={30}
                  max={300}
                  value={[pollInterval]}
                  onValueChange={(val) => {
                    const v = Array.isArray(val) ? val[0] : val;
                    setPollInterval(v);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  How often to check for match updates (30–300 seconds).
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium">Test light</span>
                <div className="flex gap-2">
                  {[
                    { label: "Red", hex: "#ef4444" },
                    { label: "Blue", hex: "#3b82f6" },
                    { label: "Green", hex: "#22c55e" },
                    { label: "Purple", hex: "#a855f7" },
                    { label: "White", hex: "#ffffff" },
                  ].map(({ label, hex }) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Test ${label} colour`}
                      title={label}
                      disabled={testingColor !== null}
                      onClick={() => handleTestColor(hex)}
                      className="relative size-8 rounded-full border-2 border-white/20 transition-transform hover:scale-110 disabled:opacity-50"
                      style={{
                        backgroundColor: hex,
                        boxShadow:
                          testSuccess === hex
                            ? `0 0 0 3px white, 0 0 0 5px ${hex}`
                            : undefined,
                      }}
                    >
                      {testingColor === hex && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="size-4 animate-spin text-black/60" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {testError && (
                  <p className="text-xs text-destructive">{testError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Click a colour to send it to your light strip.
                </p>
              </div>
            </div>
          </SetupStep>
        )}
      </div>
    </div>
  );
}
