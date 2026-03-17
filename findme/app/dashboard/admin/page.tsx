"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { AdminUserView, AdminDeviceView, ApiResponse } from "@/types/api";

interface DependencyInfo {
  name: string;
  currentVersion: string;
}

interface SystemInfo {
  app: {
    version: string;
    buildDate: string | null;
    nodeVersion: string;
    nextVersion: string;
    environment: string;
  };
  database: {
    provider: string;
    locationCount: number;
    userCount: number;
    deviceCount: number;
  };
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
}

export default function AdminPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [devices, setDevices] = useState<AdminDeviceView[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "devices" | "system" | "general" | "smtp">("users");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // General settings state
  const [general, setGeneral] = useState({ public_url: "", app_name: "" });
  const [generalEnvDefaults, setGeneralEnvDefaults] = useState({ public_url: "", app_name: "FindMe" });
  const [generalSaving, setGeneralSaving] = useState(false);

  // SMTP state
  const [smtp, setSmtp] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
    smtp_from: "",
    smtp_secure: "false",
  });
  const [smtpEnvConfigured, setSmtpEnvConfigured] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Create user form state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", role: "MEMBER" });
  const [creating, setCreating] = useState(false);

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
      const [uRes, dRes, sRes, smtpRes, generalRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/devices"),
        fetch("/api/admin/system"),
        fetch("/api/admin/smtp"),
        fetch("/api/admin/settings"),
      ]);
      const uData: ApiResponse<AdminUserView[]> = await uRes.json();
      const dData: ApiResponse<AdminDeviceView[]> = await dRes.json();
      const sData: ApiResponse<SystemInfo> = await sRes.json();
      const smtpData = await smtpRes.json();
      const generalData = await generalRes.json();
      if (uData.success && uData.data) setUsers(uData.data);
      if (dData.success && dData.data) setDevices(dData.data);
      if (sData.success && sData.data) setSystemInfo(sData.data);
      if (smtpData.success && smtpData.data) {
        setSmtp((prev) => ({ ...prev, ...smtpData.data.settings }));
        setSmtpEnvConfigured(smtpData.data.envConfigured);
      }
      if (generalData.success && generalData.data) {
        setGeneral((prev) => ({ ...prev, ...generalData.data.settings }));
        setGeneralEnvDefaults(generalData.data.envDefaults);
      }
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

  async function createUser() {
    if (!newUser.email || !newUser.password) {
      setActionMessage("Email and password are required.");
      setTimeout(() => setActionMessage(null), 3000);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data: ApiResponse<{ temporaryPassword: string; email: string }> = await res.json();
      if (data.success && data.data) {
        setTempPassword(data.data.temporaryPassword);
        setActionMessage(`User "${newUser.email}" created. Share the password securely.`);
        setNewUser({ email: "", name: "", password: "", role: "MEMBER" });
        setShowCreateUser(false);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch {
      setActionMessage("Failed to create user.");
    }
    setCreating(false);
    setTimeout(() => setActionMessage(null), 5000);
  }

  function generatePassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let pw = "";
    for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setNewUser({ ...newUser, password: pw });
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
        <button
          onClick={() => setTab("general")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "general"
              ? "bg-card text-heading shadow-sm"
              : "text-sub hover:text-heading"
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setTab("system")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "system"
              ? "bg-card text-heading shadow-sm"
              : "text-sub hover:text-heading"
          }`}
        >
          System
        </button>
        <button
          onClick={() => setTab("smtp")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "smtp"
              ? "bg-card text-heading shadow-sm"
              : "text-sub hover:text-heading"
          }`}
        >
          Email
        </button>
      </div>

      {/* Users Table */}
      {tab === "users" && (
        <div className="space-y-4">
        {/* Create User Form */}
        {showCreateUser ? (
          <div className="bg-card border border-edge rounded-xl p-6">
            <h3 className="text-base font-semibold text-heading mb-4">Create User</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-sub mb-1">Email *</label>
                <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@example.com" className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">Name</label>
                <input type="text" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Full name" className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">Password *</label>
                <div className="flex gap-2">
                  <input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Password" className="flex-1 bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-blue-500" />
                  <button onClick={generatePassword} className="bg-input hover:bg-edge border border-edge-bold px-3 py-2 rounded-lg text-xs text-sub font-medium whitespace-nowrap">Generate</button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">Role</label>
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500">
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={createUser} disabled={creating} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">{creating ? "Creating..." : "Create User"}</button>
              <button onClick={() => { setShowCreateUser(false); setNewUser({ email: "", name: "", password: "", role: "MEMBER" }); }} className="text-sm text-sub hover:text-heading">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button onClick={() => setShowCreateUser(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              Create User
            </button>
          </div>
        )}
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

      {/* System Info */}
      {tab === "system" && systemInfo && (
        <div className="space-y-6">
          {/* App Info */}
          <div className="bg-card border border-edge rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl font-bold">
                FM
              </div>
              <div>
                <h2 className="text-lg font-bold text-heading">FindMe</h2>
                <p className="text-sm text-sub">Self-hosted location sharing</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Version</p>
                <p className="text-sm font-mono font-medium text-heading">v{systemInfo.app.version}</p>
              </div>
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Node.js</p>
                <p className="text-sm font-mono font-medium text-heading">{systemInfo.app.nodeVersion}</p>
              </div>
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Next.js</p>
                <p className="text-sm font-mono font-medium text-heading">v{systemInfo.app.nextVersion}</p>
              </div>
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Environment</p>
                <p className="text-sm font-mono font-medium text-heading capitalize">{systemInfo.app.environment}</p>
              </div>
            </div>
          </div>

          {/* Database Stats */}
          <div className="bg-card border border-edge rounded-xl p-6">
            <h3 className="text-base font-semibold text-heading mb-4">Database</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Provider</p>
                <p className="text-sm font-medium text-heading">{systemInfo.database.provider}</p>
              </div>
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Users</p>
                <p className="text-sm font-medium text-heading">{systemInfo.database.userCount.toLocaleString()}</p>
              </div>
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Devices</p>
                <p className="text-sm font-medium text-heading">{systemInfo.database.deviceCount.toLocaleString()}</p>
              </div>
              <div className="bg-input rounded-lg p-3">
                <p className="text-xs text-hint uppercase tracking-wide mb-1">Location Points</p>
                <p className="text-sm font-medium text-heading">{systemInfo.database.locationCount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Dependencies */}
          <div className="bg-card border border-edge rounded-xl p-6">
            <h3 className="text-base font-semibold text-heading mb-4">
              Dependencies ({systemInfo.dependencies.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {systemInfo.dependencies.map((dep) => (
                <div
                  key={dep.name}
                  className="flex items-center justify-between bg-input rounded-lg px-3 py-2"
                >
                  <a
                    href={`https://www.npmjs.com/package/${dep.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-link hover:text-link-hover truncate mr-2"
                    title={dep.name}
                  >
                    {dep.name}
                  </a>
                  <span className="text-xs font-mono text-hint flex-shrink-0">
                    {dep.currentVersion}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Dev Dependencies */}
          <div className="bg-card border border-edge rounded-xl p-6">
            <h3 className="text-base font-semibold text-heading mb-4">
              Dev Dependencies ({systemInfo.devDependencies.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {systemInfo.devDependencies.map((dep) => (
                <div
                  key={dep.name}
                  className="flex items-center justify-between bg-input rounded-lg px-3 py-2"
                >
                  <a
                    href={`https://www.npmjs.com/package/${dep.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-link hover:text-link-hover truncate mr-2"
                    title={dep.name}
                  >
                    {dep.name}
                  </a>
                  <span className="text-xs font-mono text-hint flex-shrink-0">
                    {dep.currentVersion}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="bg-card border border-edge rounded-xl p-6">
            <h3 className="text-base font-semibold text-heading mb-4">Links</h3>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/bjoernch/FindMe"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-input hover:bg-edge px-4 py-2 rounded-lg text-sm text-sub hover:text-heading transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Source Code
              </a>
              <a
                href="/api/admin/system"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-input hover:bg-edge px-4 py-2 rounded-lg text-sm text-sub hover:text-heading transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                API (JSON)
              </a>
            </div>
          </div>
        </div>
      )}

      {tab === "system" && !systemInfo && (
        <div className="bg-card border border-edge rounded-xl p-8 text-center">
          <p className="text-hint">Failed to load system information.</p>
        </div>
      )}

      {/* General Settings */}
      {tab === "general" && (
        <div className="space-y-6">
          <div className="bg-card border border-edge rounded-xl p-6">
            <h3 className="text-base font-semibold text-heading mb-2">Server Settings</h3>
            <p className="text-sm text-sub mb-4">
              Configure your FindMe instance. These settings are stored in the database and take priority over environment variables.
            </p>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm text-sub mb-1">Public URL</label>
                <input
                  type="url"
                  value={general.public_url}
                  onChange={(e) => setGeneral({ ...general, public_url: e.target.value })}
                  placeholder={generalEnvDefaults.public_url || "https://findme.example.com"}
                  className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-hint mt-1">
                  The URL where this instance is reachable from the internet. Used for QR codes and invite links.
                  {generalEnvDefaults.public_url && !general.public_url && (
                    <span className="block mt-0.5">
                      Currently using env var: <code className="font-mono bg-input px-1 rounded">{generalEnvDefaults.public_url}</code>
                    </span>
                  )}
                </p>
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">App Name</label>
                <input
                  type="text"
                  value={general.app_name}
                  onChange={(e) => setGeneral({ ...general, app_name: e.target.value })}
                  placeholder={generalEnvDefaults.app_name}
                  className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-hint mt-1">
                  Display name for your instance. Used in emails and notifications.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={async () => {
                  setGeneralSaving(true);
                  try {
                    const res = await fetch("/api/admin/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(general),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setActionMessage("Settings saved.");
                    } else {
                      setActionMessage(`Error: ${data.error}`);
                    }
                  } catch {
                    setActionMessage("Failed to save settings.");
                  }
                  setGeneralSaving(false);
                  setTimeout(() => setActionMessage(null), 3000);
                }}
                disabled={generalSaving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {generalSaving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMTP Settings */}
      {tab === "smtp" && (
        <div className="space-y-6">
          <div className="bg-card border border-edge rounded-xl p-6">
            <h3 className="text-base font-semibold text-heading mb-2">Email (SMTP) Settings</h3>
            <p className="text-sm text-sub mb-4">
              Configure SMTP to enable email notifications for invitations and geofence alerts.
              {smtpEnvConfigured && (
                <span className="block mt-1 text-xs text-hint">
                  Note: SMTP is also configured via environment variables. Dashboard settings take priority.
                </span>
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-sub mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={smtp.smtp_host}
                  onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">SMTP Port</label>
                <input
                  type="text"
                  value={smtp.smtp_port}
                  onChange={(e) => setSmtp({ ...smtp, smtp_port: e.target.value })}
                  placeholder="587"
                  className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">Username</label>
                <input
                  type="text"
                  value={smtp.smtp_user}
                  onChange={(e) => setSmtp({ ...smtp, smtp_user: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">Password</label>
                <input
                  type="password"
                  value={smtp.smtp_pass}
                  onChange={(e) => setSmtp({ ...smtp, smtp_pass: e.target.value })}
                  placeholder="App password or SMTP password"
                  className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-sub mb-1">From Address</label>
                <input
                  type="text"
                  value={smtp.smtp_from}
                  onChange={(e) => setSmtp({ ...smtp, smtp_from: e.target.value })}
                  placeholder="FindMe <noreply@example.com>"
                  className="w-full bg-input border border-edge-bold rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="flex items-center gap-2 text-sm text-sub cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtp.smtp_secure === "true"}
                    onChange={(e) => setSmtp({ ...smtp, smtp_secure: e.target.checked ? "true" : "false" })}
                    className="rounded"
                  />
                  Use SSL/TLS (port 465)
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={async () => {
                  setSmtpSaving(true);
                  try {
                    const res = await fetch("/api/admin/smtp", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(smtp),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setActionMessage("SMTP settings saved.");
                    } else {
                      setActionMessage(`Error: ${data.error}`);
                    }
                  } catch {
                    setActionMessage("Failed to save SMTP settings.");
                  }
                  setSmtpSaving(false);
                  setTimeout(() => setActionMessage(null), 3000);
                }}
                disabled={smtpSaving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {smtpSaving ? "Saving..." : "Save Settings"}
              </button>
              <button
                onClick={async () => {
                  setSmtpTesting(true);
                  try {
                    const res = await fetch("/api/admin/smtp", { method: "POST" });
                    const data = await res.json();
                    if (data.success) {
                      setActionMessage("SMTP connection test successful!");
                    } else {
                      setActionMessage(`SMTP test failed: ${data.error}`);
                    }
                  } catch {
                    setActionMessage("SMTP test failed.");
                  }
                  setSmtpTesting(false);
                  setTimeout(() => setActionMessage(null), 5000);
                }}
                disabled={smtpTesting || !smtp.smtp_host}
                className="bg-input hover:bg-edge disabled:opacity-50 text-heading text-sm font-medium px-4 py-2 rounded-lg border border-edge-bold transition-colors"
              >
                {smtpTesting ? "Testing..." : "Test Connection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
