import React, { useState } from 'react';
import { Lock, Mail, User, ShieldAlert, KeyRound, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { AuthResponse } from '../types.js';

interface AuthLayoutProps {
  onAuthSuccess: (authData: AuthResponse) => void;
  onLoginApi: (email: string, password: string) => Promise<{ success: boolean; data?: AuthResponse; error?: string }>;
  onRegisterApi: (email: string, password: string, name: string, role?: string, adminKey?: string) => Promise<{ success: boolean; data?: AuthResponse; error?: string }>;
  onResetPasswordApi: (email: string, password: string) => Promise<{ success: boolean; error?: string; message?: string }>;
}

type AuthMode = 'signin' | 'signup' | 'reset';

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  criteria: {
    length: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

const getPasswordStrength = (pass: string): PasswordStrength => {
  const criteria = {
    length: pass.length >= 8,
    hasUpper: /[A-Z]/.test(pass),
    hasLower: /[a-z]/.test(pass),
    hasNumber: /[0-9]/.test(pass),
    hasSpecial: /[^A-Za-z0-9]/.test(pass),
  };

  const score = Object.values(criteria).filter(Boolean).length;

  let label = 'Very Weak';
  let color = 'red-500';

  if (!pass) {
    label = '';
    color = 'slate-200';
  } else if (score <= 1) {
    label = 'Weak';
    color = 'red-500';
  } else if (score === 2) {
    label = 'Fair';
    color = 'orange-500';
  } else if (score === 3) {
    label = 'Good';
    color = 'amber-500';
  } else if (score === 4) {
    label = 'Strong';
    color = 'emerald-500';
  } else {
    label = 'Excellent';
    color = 'emerald-600';
  }

  return { score, label, color, criteria };
};

const colorTextClasses: Record<string, string> = {
  'red-500': 'text-red-500',
  'orange-500': 'text-orange-500',
  'amber-500': 'text-amber-500',
  'emerald-500': 'text-emerald-500',
  'emerald-600': 'text-emerald-600',
  'slate-200': 'text-slate-400',
};

export default function AuthLayout({ onAuthSuccess, onLoginApi, onRegisterApi, onResetPasswordApi }: AuthLayoutProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

  const resetFormStates = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleModeChange = (newMode: AuthMode) => {
    resetFormStates();
    setMode(newMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please specify both an email address and a password.');
      return;
    }

    if (mode === 'signup' && !name.trim()) {
      setErrorMsg('Please specify your profile name.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signin') {
        const res = await onLoginApi(email, password);
        if (res.success && res.data) {
          onAuthSuccess(res.data);
        } else {
          setErrorMsg(res.error || 'Incorrect email or password combination.');
        }
      } else if (mode === 'signup') {
        const res = await onRegisterApi(email, password, name, 'user', '');
        if (res.success && res.data) {
          onAuthSuccess(res.data);
        } else {
          setErrorMsg(res.error || 'Failed to complete registration flow.');
        }
      } else if (mode === 'reset') {
        const res = await onResetPasswordApi(email, password);
        if (res.success) {
          setSuccessMsg('Your password has been changed successfully. You may now sign in.');
          setEmail('');
          setPassword('');
          // Switch to signin after brief delay
          setTimeout(() => {
            setMode('signin');
            setErrorMsg(null);
            setSuccessMsg(null);
          }, 4000);
        } else {
          setErrorMsg(res.error || 'Failed to locate email or reset password.');
        }
      }
    } catch (e: any) {
      setErrorMsg('Service connection timeout. Please verify backend is active.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 select-none font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Visual Emblem Brand */}
        <div className="flex justify-center">
          <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-md border border-slate-800">
            <Lock className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-950 font-sans">
          PrivateVault
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          {mode === 'signin' && 'Sign in to access your secure vaults'}
          {mode === 'signup' && 'Create your credentials to launch a private vault'}
          {mode === 'reset' && 'Specify register email to update your account passphrase'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 border border-slate-200 shadow-sm rounded-2xl sm:px-10">
          
          {/* Diagnostic alert message */}
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-xs flex gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-650 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-xs flex gap-2 font-medium">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Field: Name (Only on signup) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                  Name
                </label>
                <div className="mt-1 relative rounded-md shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="h-4.5 w-4.5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="block w-full pl-10 pr-3 py-2.5 sm:text-sm bg-slate-50/50 hover:bg-slate-50 border border-slate-350 focus:bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Field: Email */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                Email Address
              </label>
              <div className="mt-1 relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email adress (e.g. name@domain.com)"
                  className="block w-full pl-10 pr-3 py-2.5 sm:text-sm bg-slate-50/50 hover:bg-slate-50 border border-slate-350 focus:bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Field: Passphrase */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                  {mode === 'reset' ? 'New Password' : 'Password'}
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => handleModeChange('reset')}
                    className="text-xs hover:underline text-blue-600 font-semibold cursor-pointer"
                  >
                    Reset password
                  </button>
                )}
              </div>
              <div className="mt-1 relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="h-4.5 w-4.5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'reset' ? "Set new password passphrase" : "Enter account password"}
                  className="block w-full pl-10 pr-10 py-2.5 sm:text-sm bg-slate-50/50 hover:bg-slate-50 border border-slate-350 focus:bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {(mode === 'signup' || mode === 'reset') && password && (
                <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Password Security Strength
                    </span>
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${colorTextClasses[strength.color]}`}>
                      {strength.label}
                    </span>
                  </div>

                  {/* Visual Strength Meter Bars */}
                  <div className="grid grid-cols-5 gap-1.5 h-1.5">
                    {[1, 2, 3, 4, 5].map((level) => {
                      const isActive = level <= strength.score;
                      let barColor = 'bg-slate-200';
                      if (isActive) {
                        if (strength.score <= 1) barColor = 'bg-red-500';
                        else if (strength.score === 2) barColor = 'bg-orange-500';
                        else if (strength.score === 3) barColor = 'bg-amber-500';
                        else if (strength.score === 4) barColor = 'bg-emerald-500';
                        else barColor = 'bg-emerald-600';
                      }
                      return (
                        <div
                          key={level}
                          className={`h-full rounded-xs transition-colors duration-300 ${barColor}`}
                        />
                      );
                    })}
                  </div>

                  {/* Requirements Sub-List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-slate-200/50">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium leading-none">
                      {strength.criteria.length ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-full shrink-0" />
                      )}
                      <span className={strength.criteria.length ? 'text-slate-700' : 'text-slate-400'}>
                        At least 8 characters
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-medium leading-none">
                      {strength.criteria.hasUpper ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-full shrink-0" />
                      )}
                      <span className={strength.criteria.hasUpper ? 'text-slate-700' : 'text-slate-400'}>
                        Uppercase letter [A-Z]
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-medium leading-none">
                      {strength.criteria.hasLower ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-full shrink-0" />
                      )}
                      <span className={strength.criteria.hasLower ? 'text-slate-700' : 'text-slate-400'}>
                        Lowercase letter [a-z]
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-medium leading-none">
                      {strength.criteria.hasNumber ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-full shrink-0" />
                      )}
                      <span className={strength.criteria.hasNumber ? 'text-slate-700' : 'text-slate-400'}>
                        Numerical digit [0-9]
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-medium leading-none sm:col-span-2">
                      {strength.criteria.hasSpecial ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-full shrink-0" />
                      )}
                      <span className={strength.criteria.hasSpecial ? 'text-slate-700' : 'text-slate-400'}>
                        Special symbol (e.g. !@#$%^&*)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>



            {/* Submit layout action button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-sm font-semibold cursor-pointer text-white bg-slate-900 hover:bg-blue-600 focus:outline-none transition-all duration-150"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Establishing security context...</span>
                  </span>
                ) : (
                  <span>
                    {mode === 'signin' && 'Sign In'}
                    {mode === 'signup' && 'Create an Account'}
                    {mode === 'reset' && 'Reset password'}
                  </span>
                )}
              </button>
            </div>
          </form>

          {/* Toggle modes interface */}
          <div className="mt-6 border-t border-slate-150 pt-4 text-center">
            {mode === 'signin' ? (
              <p className="text-xs text-slate-550">
                New to PrivateVault?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('signup')}
                  className="font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Create an Account
                </button>
              </p>
            ) : mode === 'signup' ? (
              <p className="text-xs text-slate-550">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('signin')}
                  className="font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-550">
                Remember your password passphrase?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('signin')}
                  className="font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
