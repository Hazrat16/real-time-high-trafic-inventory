import type { UserResponse } from "@inventory/types";

const STORAGE_KEY = "inventory-demo-user-id";

export function loadStoredUserId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function storeUserId(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
}

export function UserPicker({
  users,
  selectedId,
  onChange,
}: {
  users: UserResponse[];
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
      <span className="font-medium text-slate-400">Demo shopper</span>
      <select
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        value={selectedId ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Select user…
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            @{u.username}
          </option>
        ))}
      </select>
      <span className="text-xs text-slate-500">
        Sent as <code className="text-slate-400">X-User-Id</code>
      </span>
    </label>
  );
}
