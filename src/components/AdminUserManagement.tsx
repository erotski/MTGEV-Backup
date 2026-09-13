import React, { useState, useEffect } from 'react';
import { adminAuthService, AdminUser, SecurityAuditLog } from '../services/adminAuthService';
import { ShieldCheck, UserPlus, Key, Lock, Smartphone, RefreshCw, AlertCircle, CheckCircle2, Copy, Download, Trash2, Edit3, History, LogOut, QrCode, ShieldAlert, Users, Check, Sparkles, UserCheck } from 'lucide-react';

interface AdminUserManagementProps {
  onLogout: () => void;
}

export const AdminUserManagement: React.FC<AdminUserManagementProps> = ({ onLogout }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [currentSession, setCurrentSession] = useState(adminAuthService.getCurrentSession());

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'users' | 'recovery' | 'logs'>('users');

  // New User Modal State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newFullName, setNewFullName] = useState<string>('');
  const [newRole, setNewRole] = useState<AdminUser['role']>('Catalog Moderator');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newSecurityQuestion, setNewSecurityQuestion] = useState<string>('What was the name of your first Magic the Gathering deck?');
  const [newSecurityAnswer, setNewSecurityAnswer] = useState<string>('');
  const [newRequire2Fa, setNewRequire2Fa] = useState<boolean>(true);
  const [addUserError, setAddUserError] = useState<string>('');

  // Password Reset Modal State
  const [resetModalUser, setResetModalUser] = useState<AdminUser | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState<string>('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string>('');

  // Recovery Codes Modal State
  const [recoveryCodesUser, setRecoveryCodesUser] = useState<AdminUser | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<boolean>(false);

  // Auto refresh data
  const refreshData = () => {
    setUsers(adminAuthService.getUsers());
    setAuditLogs(adminAuthService.getAuditLogs());
    setCurrentSession(adminAuthService.getCurrentSession());
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError('');

    if (!newUsername.trim() || !newEmail.trim() || !newPassword.trim() || !newSecurityAnswer.trim()) {
      setAddUserError('Please fill out all required user fields.');
      return;
    }

    // Check existing username
    if (users.some((u) => u.username.toLowerCase() === newUsername.trim().toLowerCase())) {
      setAddUserError('An admin user with this username already exists.');
      return;
    }

    adminAuthService.addAdminUser(
      {
        username: newUsername.trim(),
        email: newEmail.trim(),
        fullName: newFullName.trim() || newUsername.trim(),
        role: newRole,
        twoFactorEnabled: newRequire2Fa,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        securityQuestion: newSecurityQuestion,
        securityAnswerHash: newSecurityAnswer.trim().toLowerCase(),
        status: 'active',
      },
      newPassword.trim()
    );

    setIsAddUserModalOpen(false);
    setNewUsername('');
    setNewEmail('');
    setNewFullName('');
    setNewPassword('');
    setNewSecurityAnswer('');
    refreshData();
  };

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !resetNewPassword.trim()) return;

    adminAuthService.resetUserPassword(resetModalUser.id, resetNewPassword.trim());
    setResetSuccessMsg(`Password successfully reset for ${resetModalUser.username}.`);
    setTimeout(() => {
      setResetModalUser(null);
      setResetNewPassword('');
      setResetSuccessMsg('');
      refreshData();
    }, 1500);
  };

  const handleToggle2FA = (user: AdminUser) => {
    adminAuthService.toggleUser2FA(user.id, !user.twoFactorEnabled);
    refreshData();
  };

  const handleDeleteUser = (user: AdminUser) => {
    if (user.id === 'usr_admin_master') {
      alert('Master admin account cannot be deleted.');
      return;
    }
    if (confirm(`Are you sure you want to revoke access and delete admin user "${user.username}"?`)) {
      adminAuthService.deleteUser(user.id);
      refreshData();
    }
  };

  const handleRegenerateCodes = (userId: string) => {
    adminAuthService.generateNewRecoveryCodes(userId);
    refreshData();
    const updated = adminAuthService.getUsers().find((u) => u.id === userId);
    if (updated) setRecoveryCodesUser(updated);
  };

  const handleCopyCodesText = () => {
    if (!recoveryCodesUser) return;
    const text = `MTG Admin Emergency Recovery Codes for ${recoveryCodesUser.username}:\n` + recoveryCodesUser.recoveryCodes.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedCodeId(true);
    setTimeout(() => setCopiedCodeId(false), 2000);
  };

  const currentUser = currentSession?.user;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      {/* Top Banner: Active Admin Session Status */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center font-black text-lg shadow-lg shrink-0">
            {currentUser?.username.substring(0, 2).toUpperCase() || 'AD'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white">{currentUser?.fullName || 'Authenticated Administrator'}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {currentUser?.role || 'Super Admin'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                2FA Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Session Authenticated • Username: <span className="text-slate-200 font-bold">{currentUser?.username}</span> ({currentUser?.email})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>Lock / Sign Out</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'users' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Admin Users Directory ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('recovery')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'recovery' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>My 2FA & Emergency Recovery</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logs' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5 text-purple-400" />
            <span>Security Audit Log ({auditLogs.length})</span>
          </button>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Admin User</span>
          </button>
        )}
      </div>

      {/* VIEW 1: ADMIN USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="p-6 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">User Account</th>
                  <th className="py-3 px-4">Security Role</th>
                  <th className="py-3 px-4">2-Way Auth (2FA)</th>
                  <th className="py-3 px-4">Last Active</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Security Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-amber-400 font-bold flex items-center justify-center shrink-0">
                          {u.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{u.fullName}</span>
                            {u.id === 'usr_admin_master' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800">MASTER</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">@{u.username} • {u.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        u.role === 'Super Admin' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggle2FA(u)}
                        title="Click to toggle 2FA requirement"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer transition ${
                          u.twoFactorEnabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{u.twoFactorEnabled ? '2FA Enforced' : 'Optional'}</span>
                      </button>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-500 text-[11px]">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        u.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {u.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setResetModalUser(u);
                            setResetNewPassword('');
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition flex items-center gap-1"
                        >
                          <Key className="w-3 h-3 text-amber-600" />
                          <span>Reset Pass</span>
                        </button>

                        <button
                          onClick={() => setRecoveryCodesUser(u)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition flex items-center gap-1"
                        >
                          <Smartphone className="w-3 h-3 text-cyan-600" />
                          <span>Codes ({u.recoveryCodes.length})</span>
                        </button>

                        {u.id !== 'usr_admin_master' && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: MY 2FA & EMERGENCY RECOVERY CODES */}
      {activeTab === 'recovery' && currentUser && (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Authenticator QR Code Setup */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">2FA Authenticator App Integration</h3>
                  <p className="text-xs text-slate-400">Google Authenticator, Authy, 1Password, or Microsoft Authenticator</p>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
                <div className="w-24 h-24 bg-white rounded-lg p-2 flex items-center justify-center shrink-0">
                  <QrCode className="w-20 h-20 text-slate-900" />
                </div>
                <div className="space-y-1 font-mono text-xs">
                  <span className="text-slate-400 text-[10px] block">TOTP SECRET KEY:</span>
                  <div className="bg-slate-900 px-2.5 py-1 rounded text-amber-400 font-bold border border-slate-800 select-all">
                    {currentUser.twoFactorSecret || 'JBSWY3DPEHPK3PXP'}
                  </div>
                  <span className="text-slate-400 text-[10px] block mt-1">ISSUER: MTG-EV-Admin ({currentUser.username})</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Scan the QR code or paste the secret key into your preferred authenticator app to receive dynamic 6-digit verification codes on your mobile device.
              </p>
            </div>

            {/* Emergency Recovery Codes Box */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Emergency Backup Recovery Codes</h3>
                    <p className="text-xs text-slate-400">{currentUser.recoveryCodes.length} single-use backup codes active</p>
                  </div>
                </div>

                <button
                  onClick={() => handleRegenerateCodes(currentUser.id)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-bold border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Regenerate</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-amber-300">
                {currentUser.recoveryCodes.map((code, idx) => (
                  <div key={idx} className="bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800 flex items-center justify-between">
                    <span className="font-bold">{code}</span>
                    <span className="text-[9px] text-slate-500">#{idx + 1}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-slate-400">
                  Store these emergency codes in a secure location. Each code can be used once to unlock access if you lose your phone.
                </p>
                <button
                  onClick={() => {
                    setRecoveryCodesUser(currentUser);
                    handleCopyCodesText();
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                >
                  {copiedCodeId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCodeId ? 'Copied!' : 'Copy All'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: SECURITY AUDIT LOG */}
      {activeTab === 'logs' && (
        <div className="p-6 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Security Event</th>
                  <th className="py-3 px-4">Event Details</th>
                  <th className="py-3 px-4">IP & Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-900">
                      @{log.username}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.action.includes('SUCCESS') || log.action.includes('VERIFIED')
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.action.includes('FAILED')
                          ? 'bg-rose-100 text-rose-800 font-bold'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-sans text-xs">
                      {log.details}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD NEW ADMIN USER */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-base text-white">Create Admin User Account</h3>
              </div>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {addUserError && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{addUserError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Username *</label>
                <input
                  type="text"
                  placeholder="e.g. jdoe_admin"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. jdoe@mtgeg.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as AdminUser['role'])}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="Catalog Moderator">Catalog Moderator</option>
                    <option value="Security Auditor">Security Auditor</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Initial Password *</label>
                  <input
                    type="password"
                    placeholder="Enter initial password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Security Question Answer *</label>
                <input
                  type="text"
                  placeholder="Answer for recovery (e.g. black lotus)"
                  value={newSecurityAnswer}
                  onChange={(e) => setNewSecurityAnswer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-2fa"
                  checked={newRequire2Fa}
                  onChange={(e) => setNewRequire2Fa(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
                />
                <label htmlFor="chk-2fa" className="text-slate-300 font-bold cursor-pointer">
                  Require 2-Way Authentication (2FA)
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RESET PASSWORD */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-base text-white">Reset Password</h3>
              </div>
              <button onClick={() => setResetModalUser(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-300">
              Set new master password for user <span className="text-amber-400 font-bold">@{resetModalUser.username}</span>:
            </p>

            {resetSuccessMsg && (
              <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{resetSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
              <input
                type="password"
                placeholder="Enter new password..."
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                required
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW USER RECOVERY CODES */}
      {recoveryCodesUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-cyan-400" />
                <h3 className="font-black text-base text-white">Backup Recovery Codes</h3>
              </div>
              <button onClick={() => setRecoveryCodesUser(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-300">
              Active emergency recovery codes for <span className="text-amber-400 font-bold">@{recoveryCodesUser.username}</span>:
            </p>

            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-amber-300">
              {recoveryCodesUser.recoveryCodes.map((code, idx) => (
                <div key={idx} className="bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800 flex items-center justify-between">
                  <span>{code}</span>
                  <span className="text-[9px] text-slate-500">#{idx + 1}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => handleRegenerateCodes(recoveryCodesUser.id)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-bold border border-slate-700 transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate New</span>
              </button>

              <button
                onClick={handleCopyCodesText}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
              >
                {copiedCodeId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCodeId ? 'Copied!' : 'Copy Backup Codes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
