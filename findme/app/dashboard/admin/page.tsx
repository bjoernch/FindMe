"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { AdminUserView, AdminDeviceView, ApiResponse } from "@/types/api";

export default function AdminPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [devices, setDevices] = useState<AdminDeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "devices">("users");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  useEffect(() => {
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (session && role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }

    if (session) loadData();
  }, [session, router]);

  async function loadData() {
    try {
      const [uRes, dRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/devices"),
      ]);
      const uData: ApiResponse<AdminUserView[]> = await uRes.json();
      const dData: ApiResponse<AdminDeviceView[]> = await dRes.json();
      if (uData.success && uData.data) setUsers(uData.data);
      if (dData.success && dData.data) setDevices(dData.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(userId: string, name: string | null) {
    if (
      !confirm(
        `Delete user "${name || "unknown"}" and all their data? This cannot be undone.`
      )
    )
      return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data: ApiResponse<{ deleted: boolean }> = await res.json();
      if (data.success) {
        setActionMessage(`User "${name}" deleted successfully.`);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage("Failed to delete user.");
    }
    setTimeout(() => setActionMessage(null), 5000);
  }

  async function resetPassword(userId: string, name: string | null) {
    if (
      !confirm(
        `Reset password for "${name || "unknown"}"? A temporary password will be generated.`
      )
    )
      return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "resetPassword" }),
      });
      const data: ApiResponse<{ temporaryPassword: string }> = await res.json();
      if (data.success && data.data) {
        setTempPassword(data.data.temporaryPassword);
        setActionMessage(
          `Password reset for "${name}". Share the temporary password securely.`
        );
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage("Failed to reset password.");
    }
  }

  async function toggleRole(userId: string, currentRole: string) {
    const newRole = currentRole === "ADMIN" ? "MEMBER" : "ADMIN";
    if (!confirm(`Change role to ${newRole}?`)) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "toggleRole" }),
      });
      const data: ApiResponse<{ newRole: string }> = await res.json();
      if (data.success) {
        setActionMessage(`Role updated to ${newRole}.`);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage("Failed to update role.");
    }
    setTimeout(() => setActionMessage(null), 5000);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-sub">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-heading mb-6">Administration</h1>

      {/* Action messages */}
      {actionMessage && (
        <div className="bg-active-bg border border-active-edge rounded-xl p-4 mb-4 text-link text-sm">
          {actionMessage}
        </div>
      )}

      {/* Temp password display */}
      {tempPassword && (
        <div className="bg-warn-bg border border-warn-fg/30 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-heading mb-1">
                Temporary Password
              </p>
              <code className="text-sm font-mono text-warn-fg bg-input px-2 py-1 rounded">
                {tempPassword}
              </code>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(tempPassword);
                setTempPassword(null);
                setActionMessage("Password copied to clipboard!");
                setTimeout(() => setActionMessage(null), 3000);
              }}
              className="text-sm bg-warn-fg text-white px-3 py-1.5 rounded-lg hover:opacity-80"
            >
              Copy & Close
            </button>
          </div>
          <p className="text-xs text-hint mt-2">
            Share this password securely. It will not be shown again.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-input rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("users")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "users"
              ? "bg-card text-heading shadow-sm"
              : "text-sub hover:text-heading"
          }`}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setTab("devices")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "devices"
              ? "bg-card text-heading shadow-sm"
              : "text-sub hover:text-heading"
          }`}
        >
          Devices ({devices.length})
        </button>
      </div>

      {/* Users Table */}
      {tab === "users" && (
        <div className="bg-card border border-edge rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge bg-input">
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Role
                </th>
                <th className="text-right px-4 py-3 text-sub font-medium">
                  Devices
                </th>
                <th className="text-right px-4 py-3 text-sub font-medium">
                  Locations
                </th>
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Created
                </th>
                <th className="text-right px-4 py-3 text-sub font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-edge last:border-0 hover:bg-input transition-colors"
                >
                  <td className="px-4 py-3 text-heading font-medium">
                    {u.name || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-sub">{u.email}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        u.id !== currentUserId && toggleRole(u.id, u.role)
                      }
                      disabled={u.id === currentUserId}
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        u.role === "ADMIN"
                          ? "bg-active-bg text-link border border-active-edge"
                          : "bg-input text-sub"
                      } ${u.id !== currentUserId ? "cursor-pointer hover:opacity-70" : "cursor-default"}`}
                      title={
                        u.id === currentUserId
                          ? "Cannot change own role"
                          : `Click to make ${u.role === "ADMIN" ? "MEMBER" : "ADMIN"}`
                      }
                    >
                      {u.role}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sub text-right">
                    {u.deviceCount}
                  </td>
                  <td className="px-4 py-3 text-sub text-right">
                    {u.locationCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-hint text-sm">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => resetPassword(u.id, u.name)}
                        className="text-xs text-link hover:text-link-hover"
                        title="Reset password"
                      >
                        Reset PW
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          onClick={() => deleteUser(u.id, u.name)}
                          className="text-xs text-danger-fg hover:opacity-80"
                          title="Delete user and all data"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-hint"
                  >
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Devices Table */}
      {tab === "devices" && (
        <div className="bg-card border border-edge rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge bg-input">
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Device
                </th>
                <th className="text-left px-4 py-3 text-sub font-medium">
                  User
                </th>
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Platform
                </th>
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-sub font-medium">
                  Locations
                </th>
                <th className="text-left px-4 py-3 text-sub font-medium">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-edge last:border-0 hover:bg-input transition-colors"
                >
                  <td className="px-4 py-3 text-heading font-medium">
                    {d.name}
                    {d.isPrimary && (
                      <span className="ml-2 text-xs text-link bg-active-bg px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sub">
                    {d.userName || d.userEmail}
                  </td>
                  <td className="px-4 py-3 text-sub capitalize">
                    {d.platform}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block w-2 h-2 rounded-full mr-2 ${
                        d.isActive ? "bg-success-fg" : "bg-dim"
                      }`}
                    />
                    <span className="text-sub">
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sub text-right">
                    {d.locationCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-hint text-sm">
                    {d.lastSeen
                      ? new Date(d.lastSeen).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-hint"
                  >
                    No devices found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
