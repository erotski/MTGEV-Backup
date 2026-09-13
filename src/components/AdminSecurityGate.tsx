import React, { useState } from 'react';
import { adminAuthService, AdminUser } from '../services/adminAuthService';
import { ShieldCheck, KeyRound, Lock, Smartphone, AlertCircle, CheckCircle2, ArrowRight, ShieldAlert, Key } from 'lucide-react';

interface AdminSecurityGateProps {
  onAuthenticated: () => void;
}

export const AdminSecurityGate: React.FC<AdminSecurityGateProps> = ({ onAuthenticated }) => {
  const [step, setStep] = useState<'login' | '2fa' | 'recovery'>('login');
  
  // Login Form state
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [pendingUser, setPendingUser] = useState<AdminUser | null>(null);

  // 2FA Form state
  const [otpCode, setOtpCode] = useState<string>('');
  const [twoFactorError, setTwoFactorError] = useState<string>('');

  // Recovery Form state
  const [recoveryMode, setRecoveryMode] = useState<'code' | 'question'>('code');
  const [recoveryUsername, setRecoveryUsername] = useState<string>('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState<string>('');
  const [securityAnswerInput, setSecurityAnswerInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [recoverySuccessMessage, setRecoverySuccessMessage] = useState<string>('');
  const [recoveryError, setRecoveryError] = useState<string>('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!username.trim() || !password.trim()) {
      setLoginError('Please provide both username/email and password.');
      return;
    }

    const result = adminAuthService.authenticateCredentials(username, password);

    if (!result.success) {
      setLoginError(result.error || 'Authentication failed. Please check credentials.');
      return;
    }

    if (result.requires2FA && result.user) {
      setPendingUser(result.user);
      setStep('2fa');
    } else {
      onAuthenticated();
    }
  };

  const handle2FaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError('');

    if (!pendingUser) return;

    if (!otpCode.trim()) {
      setTwoFactorError('Please enter your 6-digit authenticator code or 8-digit recovery code.');
      return;
    }

    const result = adminAuthService.verify2FACode(pendingUser, otpCode);

    if (result.success) {
      onAuthenticated();
    } else {
      setTwoFactorError(result.error || 'Invalid 2FA code. Please try again.');
    }
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoverySuccessMessage('');

    if (!recoveryUsername.trim()) {
      setRecoveryError('Please enter your admin username or email.');
      return;
    }

    if (recoveryMode === 'code') {
      if (!recoveryCodeInput.trim()) {
        setRecoveryError('Please enter an 8-digit emergency recovery code.');
        return;
      }
      const user = adminAuthService.getUsers().find(
        (u) => u.username.toLowerCase() === recoveryUsername.trim().toLowerCase() || u.email.toLowerCase() === recoveryUsername.trim().toLowerCase()
      );
      if (!user) {
        setRecoveryError('No account found for that username or email.');
        return;
      }
      const result = adminAuthService.verify2FACode(user, recoveryCodeInput);
      if (result.success) {
        setRecoverySuccessMessage('Emergency recovery code verified! Account unlocked successfully.');
        setTimeout(() => {
          onAuthenticated();
        }, 1200);
      } else {
        setRecoveryError('Invalid or already used recovery code.');
      }
    } else {
      if (!securityAnswerInput.trim() || !newPasswordInput.trim()) {
        setRecoveryError('Please provide the security answer and your new password.');
        return;
      }
      const result = adminAuthService.recoverAccountBySecurityQuestion(
        recoveryUsername,
        securityAnswerInput,
        newPasswordInput
      );
      if (result.success) {
        setRecoverySuccessMessage('Password successfully reset! Unlocking Admin Portal...');
        setTimeout(() => {
          onAuthenticated();
        }, 1200);
      } else {
        setRecoveryError(result.error || 'Recovery failed.');
      }
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
      {/* Subtle Ambient Background Gradient */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Banner */}
      <div className="text-center mb-6 relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-3 shadow-inner">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black tracking-tight text-white">Admin Security Portal</h2>
        <p className="text-xs text-slate-400 mt-1">2-Way Authentication & Access Gate</p>
      </div>

      {/* STEP 1: USERNAME & PASSWORD LOGIN */}
      {step === 'login' && (
        <form onSubmit={handleLoginSubmit} className="space-y-4 relative z-10">
          {loginError && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>Username or Email</span>
            </label>
            <input
              type="text"
              placeholder="e.g. admin or admin@mtgeg.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Password</span>
              </label>
              <button
                type="button"
                onClick={() => setStep('recovery')}
                className="text-[11px] text-amber-400 hover:underline cursor-pointer"
              >
                Forgot / Recovery?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter admin password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Proceed to 2FA Step</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* STEP 2: TWO-FACTOR AUTHENTICATION (2FA) */}
      {step === '2fa' && pendingUser && (
        <form onSubmit={handle2FaSubmit} className="space-y-4 relative z-10">
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700 text-center">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center mx-auto mb-2">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">2-Way Security Verification</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Enter the 6-digit code from your Authenticator app for account <span className="text-amber-400 font-mono font-bold">{pendingUser.username}</span>
            </p>
          </div>

          {twoFactorError && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{twoFactorError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              6-Digit Authenticator / TOTP Code
            </label>
            <input
              type="text"
              maxLength={12}
              placeholder="e.g. 123456 or 8492-1049"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-3 text-center text-lg font-mono tracking-widest text-emerald-400 focus:outline-none focus:border-cyan-400 transition"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <button
              type="submit"
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Verify & Log In to Admin Portal</span>
            </button>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setStep('login')}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                ← Back to Password Login
              </button>

              <button
                type="button"
                onClick={() => {
                  setRecoveryUsername(pendingUser.username);
                  setStep('recovery');
                }}
                className="text-xs text-amber-400 hover:underline cursor-pointer"
              >
                Use Emergency Recovery Code
              </button>
            </div>
          </div>
        </form>
      )}

      {/* STEP 3: ACCOUNT RECOVERY & PASSWORD RESET */}
      {step === 'recovery' && (
        <form onSubmit={handleRecoverySubmit} className="space-y-4 relative z-10">
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700 text-center">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Emergency Account Recovery</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Recover administrative access using backup codes or security question.
            </p>
          </div>

          {recoverySuccessMessage && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{recoverySuccessMessage}</span>
            </div>
          )}

          {recoveryError && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{recoveryError}</span>
            </div>
          )}

          {/* Recovery Mode Selector */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setRecoveryMode('code')}
              className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
                recoveryMode === 'code' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              8-Digit Recovery Code
            </button>
            <button
              type="button"
              onClick={() => setRecoveryMode('question')}
              className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
                recoveryMode === 'question' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Security Question
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Admin Username / Email</label>
            <input
              type="text"
              placeholder="e.g. admin"
              value={recoveryUsername}
              onChange={(e) => setRecoveryUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          {recoveryMode === 'code' ? (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">8-Digit Emergency Recovery Code</label>
              <input
                type="text"
                placeholder="e.g. 8492-1049"
                value={recoveryCodeInput}
                onChange={(e) => setRecoveryCodeInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          ) : (
            <>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 text-[10px] block font-mono">SECURITY QUESTION:</span>
                <span className="text-slate-200 font-bold">
                  {adminAuthService.getUsers().find(
                    (u) => u.username.toLowerCase() === recoveryUsername.trim().toLowerCase() || u.email.toLowerCase() === recoveryUsername.trim().toLowerCase()
                  )?.securityQuestion || 'What was the name of your first Magic the Gathering deck?'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Your Answer</label>
                <input
                  type="text"
                  placeholder="Enter security question answer..."
                  value={securityAnswerInput}
                  onChange={(e) => setSecurityAnswerInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  placeholder="Enter new master password..."
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <Key className="w-4 h-4" />
            <span>Recover Account & Unlock Access</span>
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setStep('login')}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Cancel & Return to Login
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
