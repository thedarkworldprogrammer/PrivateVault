import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { Api } from '../utils/api.js';

interface ResetPasswordProps {
  token: string;
}

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

export default function ResetPassword({ token }: ResetPasswordProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

  // Validate the reset token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const res = await Api.validateResetToken(token);
        if (res.success && res.data) {
          setEmail(res.data.email);
        } else {
          setValidationError(res.error || 'This password reset link is invalid, expired, or has already been used.');
        }
      } catch (e) {
        setValidationError('Failed to validate connection for security link.');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password.trim() || !confirmPassword.trim()) {
      setErrorMsg('Please specify both password fields.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please ensure both fields are identical.');
      return;
    }

    if (strength.score < 3) {
      setErrorMsg('For your protection, please choose a stronger password matching more security criteria.');
      return;
    }

    setLoading(true);

    try {
      const res = await Api.applyResetPassword(token, password);
      if (res.success) {
        setSuccessMsg('Your security credentials have been updated successfully. Redirecting to sign in...');
        setPassword('');
        setConfirmPassword('');
        // Redirect to Login page after 3 seconds
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      } else {
        setErrorMsg(res.error || 'Password reset failed. This link may have expired.');
      }
    } catch (e: any) {
      setErrorMsg('Failed to process password change. Connection timeout.');
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
            <Lock className="w-8 h-8 text-blue-500 animate-[pulse_2s_infinite]" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-slate-950 font-sans">
          Reset Your Password
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          {email ? `Updating credentials for ${email}` : 'Establish a secure and verified access path'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 border border-slate-200 shadow-sm rounded-2xl sm:px-10">
          
          {isValidating ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-semibold text-slate-600 font-mono">Verifying cryptolink authenticity...</p>
            </div>
          ) : validationError ? (
            <div className="text-center py-4 space-y-4">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 border border-red-200">
                <AlertCircle className="h-6 w-6 text-red-650" />
              </div>
              <h3 className="text-base font-bold text-slate-950">Security Check Failed</h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                {validationError}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/'; }}
                  className="inline-flex justify-center py-2 px-4 border border-slate-350 rounded-xl shadow-xs text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  Return to Login
                </button>
              </div>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-xs flex gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-red-650 flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-lg p-3 text-xs flex gap-2 font-medium">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Field: Passphrase */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                    New Password
                  </label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="h-4.5 w-4.5" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
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
                  {password && (
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

                {/* Field: Confirm Passphrase */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                    Confirm New Password
                  </label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="h-4.5 w-4.5" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="block w-full pl-10 pr-3 py-2.5 sm:text-sm bg-slate-50/50 hover:bg-slate-50 border border-slate-350 focus:bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>
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
                        <span>Re-encrypting vault access keys...</span>
                      </span>
                    ) : (
                      <span>Reset Password</span>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          <div className="mt-6 border-t border-slate-150 pt-4 text-center">
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              Back to Login
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
