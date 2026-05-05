import { useState } from "react";
import { toast } from "sonner";
import {
  invalidateInventoryQueries,
  queryClient,
  useCreateDropMutation,
} from "../inventory.queries.ts";

export function CreateDropPanel() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("220");
  const [units, setUnits] = useState(25);
  const mut = useCreateDropMutation({
    onSuccess: () => {
      toast.success("Drop created");
      setName("");
      invalidateInventoryQueries(queryClient);
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
      >
        Initialize new drop (API demo)
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate({
          name,
          price,
          totalUnits: units,
          startsAt: new Date(Date.now() - 1000).toISOString(),
        });
      }}
    >
      <p className="text-sm font-medium text-slate-300">POST /api/drops</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-500">
          Name
          <input
            required
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          Price (USD)
          <input
            required
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          Units
          <input
            required
            type="number"
            min={1}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
            value={units}
            onChange={(e) => setUnits(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mut.isPending}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500 disabled:opacity-60"
        >
          {mut.isPending ? "Creating…" : "Create drop"}
        </button>
        <button
          type="button"
          className="text-sm text-slate-500 hover:text-slate-300"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-600">
        Starts immediately (startsAt = now − 1s). Stock initialized to total
        units.
      </p>
    </form>
  );
}
