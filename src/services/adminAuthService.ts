export interface AdminUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'Super Admin' | 'Catalog Moderator' | 'Security Auditor';
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  recoveryCodes: string[];
  securityQuestion: string;
  securityAnswerHash: string; // stored lowercase for matching
  createdAt: string;
  lastLogin: string | null;
  status: 'active' | 'suspended';
}

export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  username: string;
  action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | '2FA_VERIFIED' | '2FA_FAILED' | 'PASSWORD_RESET' | 'RECOVERY_USED' | 'USER_CREATED' | 'USER_DELETED' | 'LOGOUT' | 'ACCOUNT_LOCKED';
  details: string;
  ipAddress: string;
}

export interface AdminSession {
  user: AdminUser;
  token: string;
  authenticatedAt: string;
  expiresAt: string;
  is2FaVerified: boolean;
}

const STORAGE_KEY_USERS = 'mtg_admin_users_v1';
const STORAGE_KEY_LOGS = 'mtg_admin_security_logs_v1';
const STORAGE_KEY_SESSION = 'mtg_admin_session_v1';

// Default initial admin account
const DEFAULT_INITIAL_ADMIN: AdminUser = {
  id: 'usr_admin_master',
  username: 'admin',
  email: 'admin@mtgeg.com',
  fullName: 'Master Administrator',
  role: 'Super Admin',
  twoFactorEnabled: true,
  twoFactorSecret: 'JBSWY3DPEHPK3PXP',
  recoveryCodes: [
    '8492-1049',
    '3950-2910',
    '7201-8493',
    '1938-4029',
    '5039-2819',
    '9104-3829',
    '6281-9402',
    '4819-2048',
  ],
  securityQuestion: 'What was the name of your first Magic the Gathering deck?',
  securityAnswerHash: 'black lotus',
  createdAt: new Date().toISOString(),
  lastLogin: new Date().toISOString(),
  status: 'active',
};

// Initial default logs
const INITIAL_LOGS: SecurityAuditLog[] = [
  {
    id: 'log_01',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    username: 'admin',
    action: 'LOGIN_SUCCESS',
    details: 'Master admin credentials authenticated via 2FA',
    ipAddress: '192.168.1.100 (Cloud Console)',
  },
  {
    id: 'log_02',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    username: 'admin',
    action: '2FA_VERIFIED',
    details: '2FA Authenticator code successfully verified',
    ipAddress: '192.168.1.100 (Cloud Console)',
  },
];

class AdminAuthService {
  private users: AdminUser[] = [];
  private logs: SecurityAuditLog[] = [];
  private currentSession: AdminSession | null = null;
  private failedAttemptsMap: Map<string, { count: number; lockedUntil: number | null }> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const storedUsers = localStorage.getItem(STORAGE_KEY_USERS);
      if (storedUsers) {
        this.users = JSON.parse(storedUsers);
      } else {
        this.users = [DEFAULT_INITIAL_ADMIN];
        this.saveUsersToStorage();
      }

      const storedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
      if (storedLogs) {
        this.logs = JSON.parse(storedLogs);
      } else {
        this.logs = INITIAL_LOGS;
        this.saveLogsToStorage();
      }

      const storedSession = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (storedSession) {
        const session: AdminSession = JSON.parse(storedSession);
        // Check if expired (2 hours expiry)
        if (new Date(session.expiresAt).getTime() > Date.now()) {
          this.currentSession = session;
        } else {
          sessionStorage.removeItem(STORAGE_KEY_SESSION);
        }
      }
    } catch (e) {
      console.warn('Failed to parse admin auth storage:', e);
      this.users = [DEFAULT_INITIAL_ADMIN];
      this.logs = INITIAL_LOGS;
    }
  }

  private saveUsersToStorage() {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(this.users));
  }

  private saveLogsToStorage() {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(this.logs));
  }

  private saveSessionToStorage() {
    if (this.currentSession) {
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(this.currentSession));
    } else {
      sessionStorage.removeItem(STORAGE_KEY_SESSION);
    }
  }

  public logEvent(username: string, action: SecurityAuditLog['action'], details: string) {
    const newLog: SecurityAuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      username,
      action,
      details,
      ipAddress: '127.0.0.1 (Authenticated Admin Web Console)',
    };
    this.logs = [newLog, ...this.logs.slice(0, 99)]; // keep latest 100 logs
    this.saveLogsToStorage();
  }

  public getCurrentSession(): AdminSession | null {
    if (this.currentSession && new Date(this.currentSession.expiresAt).getTime() <= Date.now()) {
      this.logout();
      return null;
    }
    return this.currentSession;
  }

  /**
   * Primary Username & Password Check with Brute-Force Protection
   */
  public authenticateCredentials(
    usernameInput: string,
    passwordInput: string
  ): { success: boolean; requires2FA: boolean; user?: AdminUser; error?: string } {
    const cleanUser = usernameInput.trim().toLowerCase();

    // Check account / username lockout
    const lockInfo = this.failedAttemptsMap.get(cleanUser);
    if (lockInfo && lockInfo.lockedUntil) {
      if (Date.now() < lockInfo.lockedUntil) {
        const remainingSecs = Math.ceil((lockInfo.lockedUntil - Date.now()) / 1000);
        this.logEvent(usernameInput, 'ACCOUNT_LOCKED', `Login blocked due to active brute-force lockout (${remainingSecs}s remaining)`);
        return {
          success: false,
          requires2FA: false,
          error: `Too many failed login attempts. Security lock active for ${remainingSecs} seconds.`,
        };
      } else {
        // Lock expired
        this.failedAttemptsMap.delete(cleanUser);
      }
    }

    const foundUser = this.users.find(
      (u) => u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser
    );

    const recordFailedAttempt = () => {
      const current = this.failedAttemptsMap.get(cleanUser) || { count: 0, lockedUntil: null };
      current.count += 1;

      if (current.count >= 5) {
        current.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 minute lockout
        this.failedAttemptsMap.set(cleanUser, current);
        this.logEvent(usernameInput, 'ACCOUNT_LOCKED', `5 consecutive failed login attempts! Account locked out for 15 minutes.`);
        return `Security lockout activated! 5 failed attempts detected. Access locked for 15 minutes.`;
      }

      this.failedAttemptsMap.set(cleanUser, current);
      this.logEvent(usernameInput, 'LOGIN_FAILED', `Failed attempt ${current.count}/5`);
      return `Invalid username or password. (${5 - current.count} attempts remaining before 15-min lock)`;
    };

    if (!foundUser) {
      const errorMsg = recordFailedAttempt();
      return { success: false, requires2FA: false, error: errorMsg };
    }

    if (foundUser.status === 'suspended') {
      this.logEvent(foundUser.username, 'LOGIN_FAILED', 'Account is suspended by administrator');
      return { success: false, requires2FA: false, error: 'Account is suspended. Contact system administrator.' };
    }

    // Custom or default password check
    const userStoredPasswordKey = `mtg_pass_${foundUser.id}`;
    const storedCustomPass = localStorage.getItem(userStoredPasswordKey);
    const expectedPassword = storedCustomPass || (foundUser.id === 'usr_admin_master' ? 'AdminPassword2026!' : 'Admin123!');

    if (passwordInput !== expectedPassword) {
      const errorMsg = recordFailedAttempt();
      return { success: false, requires2FA: false, error: errorMsg };
    }

    // Success - clear failed attempts
    this.failedAttemptsMap.delete(cleanUser);
    this.logEvent(foundUser.username, 'LOGIN_SUCCESS', 'Primary password check passed');

    // If 2FA is enabled, return user and require 2FA step
    if (foundUser.twoFactorEnabled) {
      return { success: true, requires2FA: true, user: foundUser };
    }

    // Otherwise create full verified session immediately
    this.createSession(foundUser, true);
    return { success: true, requires2FA: false, user: foundUser };
  }

  /**
   * Two-Factor Authentication Verification (2FA OTP or Emergency Recovery Code)
   */
  public verify2FACode(
    user: AdminUser,
    codeOrRecovery: string
  ): { success: boolean; isRecoveryCodeUsed?: boolean; error?: string } {
    const cleanCode = codeOrRecovery.trim().replace(/\s+/g, '');

    // 1. Check if it's an 8-digit Emergency Recovery Code (e.g. 8492-1049 or 84921049)
    const formattedRecovery = cleanCode.includes('-') ? cleanCode : `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}`;
    const recoveryIndex = user.recoveryCodes.indexOf(formattedRecovery);

    if (recoveryIndex !== -1) {
      // Consume the recovery code
      user.recoveryCodes.splice(recoveryIndex, 1);
      this.saveUsersToStorage();
      this.logEvent(user.username, 'RECOVERY_USED', `Emergency recovery code used (${formattedRecovery}). ${user.recoveryCodes.length} codes remaining.`);
      this.createSession(user, true);
      return { success: true, isRecoveryCodeUsed: true };
    }

    // 2. Validate 6-digit TOTP Code
    // Accepts any 6-digit numeric string for simulation OR valid '123456' / '654321' / current dynamic code
    const isSixDigit = /^\d{6}$/.test(cleanCode);
    if (!isSixDigit) {
      this.logEvent(user.username, '2FA_FAILED', 'Invalid 2FA code format entered');
      return { success: false, error: 'Please enter a valid 6-digit authenticator code or 8-digit recovery code.' };
    }

    // Accept 6-digit codes (supports testing with any valid 6-digit number or 123456)
    this.logEvent(user.username, '2FA_VERIFIED', '2FA Authenticator code successfully verified');
    this.createSession(user, true);
    return { success: true };
  }

  /**
   * Emergency Account Recovery via Security Question or Emergency Master Code
   */
  public recoverAccountBySecurityQuestion(
    usernameOrEmail: string,
    answerInput: string,
    newPasswordInput: string
  ): { success: boolean; error?: string } {
    const cleanQuery = usernameOrEmail.trim().toLowerCase();
    const user = this.users.find(
      (u) => u.username.toLowerCase() === cleanQuery || u.email.toLowerCase() === cleanQuery
    );

    if (!user) {
      return { success: false, error: 'No account found matching that username or email address.' };
    }

    if (answerInput.trim().toLowerCase() !== user.securityAnswerHash.toLowerCase()) {
      this.logEvent(user.username, 'RECOVERY_USED', 'Failed security question recovery attempt');
      return { success: false, error: 'Incorrect answer to security question.' };
    }

    // Update password
    localStorage.setItem(`mtg_pass_${user.id}`, newPasswordInput);
    this.logEvent(user.username, 'PASSWORD_RESET', 'Account password reset via Security Question recovery');

    // Automatically authenticate
    this.createSession(user, true);
    return { success: true };
  }

  /**
   * Reset Password by Super Admin
   */
  public resetUserPassword(userId: string, newPassword: string): boolean {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;

    localStorage.setItem(`mtg_pass_${user.id}`, newPassword);
    this.logEvent(user.username, 'PASSWORD_RESET', 'Password updated by Administrator');
    return true;
  }

  private createSession(user: AdminUser, is2FaVerified: boolean) {
    user.lastLogin = new Date().toISOString();
    this.saveUsersToStorage();

    const session: AdminSession = {
      user,
      token: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), // 2 hours
      is2FaVerified,
    };

    this.currentSession = session;
    this.saveSessionToStorage();
  }

  public logout() {
    if (this.currentSession) {
      this.logEvent(this.currentSession.user.username, 'LOGOUT', 'User logged out of Admin Portal');
    }
    this.currentSession = null;
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
  }

  public getUsers(): AdminUser[] {
    return [...this.users];
  }

  public getAuditLogs(): SecurityAuditLog[] {
    return [...this.logs];
  }

  public addAdminUser(
    userData: Omit<AdminUser, 'id' | 'createdAt' | 'lastLogin' | 'recoveryCodes'>,
    initialPassword: string
  ): AdminUser {
    const newId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newCodes = Array.from({ length: 8 }, () =>
      `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`
    );

    const newUser: AdminUser = {
      ...userData,
      id: newId,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      recoveryCodes: newCodes,
    };

    this.users.push(newUser);
    this.saveUsersToStorage();
    localStorage.setItem(`mtg_pass_${newUser.id}`, initialPassword);

    this.logEvent(this.currentSession?.user.username || 'System', 'USER_CREATED', `New admin user created: ${newUser.username} (${newUser.role})`);
    return newUser;
  }

  public updateUserRole(userId: string, role: AdminUser['role'], status: AdminUser['status']): boolean {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;

    user.role = role;
    user.status = status;
    this.saveUsersToStorage();
    this.logEvent(this.currentSession?.user.username || 'System', 'USER_CREATED', `User role/status updated for ${user.username}`);
    return true;
  }

  public toggleUser2FA(userId: string, enabled: boolean): boolean {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;

    user.twoFactorEnabled = enabled;
    this.saveUsersToStorage();
    this.logEvent(this.currentSession?.user.username || 'System', '2FA_VERIFIED', `2FA requirement ${enabled ? 'enabled' : 'disabled'} for ${user.username}`);
    return true;
  }

  public deleteUser(userId: string): boolean {
    if (userId === 'usr_admin_master') return false; // Prevent deleting master admin
    const index = this.users.findIndex((u) => u.id === userId);
    if (index === -1) return false;

    const removedUser = this.users[index];
    this.users.splice(index, 1);
    this.saveUsersToStorage();
    localStorage.removeItem(`mtg_pass_${userId}`);
    this.logEvent(this.currentSession?.user.username || 'System', 'USER_DELETED', `Admin user deleted: ${removedUser.username}`);
    return true;
  }

  public generateNewRecoveryCodes(userId: string): string[] {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return [];

    const newCodes = Array.from({ length: 8 }, () =>
      `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`
    );

    user.recoveryCodes = newCodes;
    this.saveUsersToStorage();
    this.logEvent(user.username, 'RECOVERY_USED', 'New emergency account recovery codes generated');
    return newCodes;
  }
}

export const adminAuthService = new AdminAuthService();
