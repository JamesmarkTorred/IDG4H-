import { useState } from "react";

function App() {
  const [nodeId, setNodeId] = useState("");
  const [name, setName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [address, setAddress] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");

  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setError(null);

    const normalizedNodeId = nodeId.trim();
    const normalizedName = name.trim();
    const normalizedFacilityName = facilityName.trim();
    const normalizedAddress = address.trim();
    const normalizedRegistrationCode =
      registrationCode.trim().toUpperCase();

    if (!normalizedNodeId) {
      setError("Node ID is required.");
      return;
    }

    if (!normalizedName) {
      setError("Node name is required.");
      return;
    }

    if (!normalizedFacilityName) {
      setError("Facility name is required.");
      return;
    }

    if (!normalizedAddress) {
      setError("Address is required.");
      return;
    }

    if (!normalizedRegistrationCode) {
      setError("Registration code is required.");
      return;
    }

    setIsRegistering(true);

    try {
      // Central Server registration API will be connected next.
      await new Promise((resolve) => setTimeout(resolve, 800));

      console.log("Node registration requested:", {
        nodeId: normalizedNodeId,
        name: normalizedName,
        facilityName: normalizedFacilityName,
        address: normalizedAddress,
        registrationCode: normalizedRegistrationCode,
      });

      setError(
        "Registration API is not connected yet. The registration form is ready.",
      );
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          {/* Branding */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <span className="text-2xl font-bold text-emerald-400">
                ID
              </span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">
              IDG4H
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Integrated Data Gateway for Health
            </p>
          </div>

          {/* Registration Card */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20 sm:p-8">
            <div className="mb-7">
              <h2 className="text-xl font-semibold">
                Register Edge Node
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Connect this Edge Node to the IDG4H Central Server using
                the registration credentials provided by your system
                administrator.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-5">
              {/* Node ID */}
              <div>
                <label
                  htmlFor="node-id"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Node ID
                </label>

                <input
                  id="node-id"
                  type="text"
                  value={nodeId}
                  onChange={(event) => setNodeId(event.target.value)}
                  placeholder="e.g. edge-mainit-001"
                  autoComplete="off"
                  disabled={isRegistering}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <p className="mt-2 text-xs text-slate-500">
                  The unique identifier assigned to this Edge Node.
                </p>
              </div>

              {/* Node Name */}
              <div>
                <label
                  htmlFor="node-name"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Node Name
                </label>

                <input
                  id="node-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Mainit Edge Node"
                  autoComplete="organization"
                  disabled={isRegistering}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <p className="mt-2 text-xs text-slate-500">
                  A human-readable name for this Edge Node.
                </p>
              </div>

              {/* Facility Name */}
              <div>
                <label
                  htmlFor="facility-name"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Facility Name
                </label>

                <input
                  id="facility-name"
                  type="text"
                  value={facilityName}
                  onChange={(event) =>
                    setFacilityName(event.target.value)
                  }
                  placeholder="e.g. Mainit Rural Health Unit"
                  autoComplete="organization"
                  disabled={isRegistering}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <p className="mt-2 text-xs text-slate-500">
                  The health facility associated with this Edge Node.
                </p>
              </div>

              {/* Address */}
              <div>
                <label
                  htmlFor="address"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Address
                </label>

                <textarea
                  id="address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="e.g. Mainit, Surigao del Norte"
                  autoComplete="street-address"
                  rows={2}
                  disabled={isRegistering}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <p className="mt-2 text-xs text-slate-500">
                  The physical address of the health facility.
                </p>
              </div>

              {/* Registration Code */}
              <div>
                <label
                  htmlFor="registration-code"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Registration Code
                </label>

                <input
                  id="registration-code"
                  type="text"
                  value={registrationCode}
                  onChange={(event) =>
                    setRegistrationCode(
                      event.target.value.toUpperCase(),
                    )
                  }
                  placeholder="IDG4H-XXXXXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isRegistering}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm tracking-wide text-slate-100 uppercase outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <p className="mt-2 text-xs text-slate-500">
                  The one-time registration code issued by the Central
                  Server.
                </p>
              </div>

              {/* Error / Status */}
              {error && (
                <div
                  className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-5 text-amber-300"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Register */}
              <button
                type="submit"
                disabled={isRegistering}
                className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRegistering ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                    Registering...
                  </>
                ) : (
                  "Register Edge Node"
                )}
              </button>
            </form>
          </section>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-600">
              IDG4H Edge Node
            </p>

            <p className="mt-1 text-xs text-slate-700">
              Offline-first health data gateway
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;