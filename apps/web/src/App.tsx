import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useEffect, useState } from "react";
import { DropCard } from "./components/DropCard.tsx";
import { CreateDropPanel } from "./components/CreateDropPanel.tsx";
import {
  UserPicker,
  loadStoredUserId,
  storeUserId,
} from "./components/UserPicker.tsx";
import { useDashboardSocket } from "./useDashboardSocket.ts";
import { queryClient, useDropsQuery, useUsersQuery } from "./inventory.queries.ts";

function Dashboard() {
  useDashboardSocket(queryClient);

  const usersQ = useUsersQuery();
  const dropsQ = useDropsQuery();

  const [userId, setUserId] = useState<string | null>(loadStoredUserId);

  useEffect(() => {
    if (userId) storeUserId(userId);
  }, [userId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg shadow-black/20 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/90">
                Real-time inventory
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Limited sneaker drop dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Stock syncs across tabs via Socket.io. Reservations hold
                inventory for 60 seconds; expired holds return automatically.
              </p>
            </div>
            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Live updates enabled
            </div>
          </div>

          <div className="mt-6">
          {usersQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading users…</p>
          ) : usersQ.error ? (
            <p className="text-sm text-red-400">Could not load users.</p>
          ) : (
            <UserPicker
              users={usersQ.data ?? []}
              selectedId={userId}
              onChange={(id) => setUserId(id)}
            />
          )}
          </div>
        </header>

        {dropsQ.isLoading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-slate-400">
            Loading drops…
          </div>
        ) : dropsQ.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
            Failed to load drops — is the API running on port 5000?
          </div>
        ) : dropsQ.data?.length === 0 ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-slate-300">
              No active drops. Seed the DB or create one below.
            </div>
            <CreateDropPanel />
          </div>
        ) : (
          <div className="grid items-start gap-6 md:grid-cols-2">
            {dropsQ.data!.map((d) => (
              <DropCard key={d.id} drop={d} userId={userId} />
            ))}
            <CreateDropPanel />
          </div>
        )}

        <Toaster richColors position="top-center" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
