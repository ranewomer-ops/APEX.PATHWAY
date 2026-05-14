import { useEffect, useState } from "react";
import { useApexStore } from "@/state/apexStore";
import { Workspace } from "@/workspace/Workspace";
import { BootScreen } from "@/components/BootScreen";
import { SetupScreen } from "@/components/SetupScreen";
import { LoginView } from "@/components/LoginView";

export default function App() {
  const booting = useApexStore((s) => s.booting);
  const configured = useApexStore((s) => s.configured);
  const session = useApexStore((s) => s.session);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    void useApexStore
      .getState()
      .init()
      .catch((e: unknown) => {
        setInitError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  if (initError) {
    return (
      <div className="login-screen">
        <div className="setup-card">
          <p className="eyebrow">Startup</p>
          <h2>Could not initialize</h2>
          <p className="muted-copy">{initError}</p>
        </div>
      </div>
    );
  }

  if (booting) {
    return <BootScreen />;
  }

  if (!configured) {
    return <SetupScreen />;
  }

  if (!session) {
    return <LoginView />;
  }

  return <Workspace />;
}
