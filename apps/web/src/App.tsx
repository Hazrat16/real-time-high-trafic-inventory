import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useEffect, useState } from "react";
import { DropCard } from "./components/DropCard.tsx";
import { CreateDropPanel } from "./components/CreateDropPanel.tsx";
import {
  UserPicker,
  loadStoredUserId,
  storeUserId,
} from "./components/UserPicker.tsx";
import { getDrops, getUsers } from "./api.ts";
import { useDashboardSocket } from "./useDashboardSocket.ts";

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000 },
  },
});

function Dashboard() {
  useDashboardSocket(qc);

  const usersQ = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const dropsQ = useQuery({ queryKey: ["drops"], queryFn: getDrops });

  const [userId, setUserId] = useState<string | null>(loadStoredUserId);

  useEffect(() => {
    if (userId) storeUserId(userId);
  }, [userId]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 border-b border-slate-800 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Limited drop dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Stock syncs across tabs via Socket.io. Reservations hold inventory for
          60 seconds; expired holds return automatically.
        </p>
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
        <p className="text-slate-400">Loading drops…</p>
      ) : dropsQ.error ? (
        <p className="text-red-400">
          Failed to load drops — is the API running on port 3000?
        </p>
      ) : dropsQ.data?.length === 0 ? (
        <p className="text-slate-400">
          No active drops. Seed the DB or create one below.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {dropsQ.data!.map((d) => (
            <DropCard key={d.id} drop={d} userId={userId} />
          ))}
        </div>
      )}

      <CreateDropPanel />

      <Toaster richColors position="top-center" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>
  );
}
