'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PhoneAuthProvider } from 'firebase/auth';

export default function HomePage() {
  const { user, loading, signIn, signUp, mfaState, sendMfaCode, verifyMfaCode, cancelMfa } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaCodeSent, setMfaCodeSent] = useState(false);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Reset MFA code input when MFA state changes
  useEffect(() => {
    if (!mfaState) {
      setMfaCode('');
      setMfaCodeSent(false);
    }
  }, [mfaState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      // Clean up Firebase error messages
      if (errorMessage.includes('auth/invalid-credential')) {
        setError('Invalid email or password');
      } else if (errorMessage.includes('auth/email-already-in-use')) {
        setError('Email already in use. Try signing in instead.');
      } else if (errorMessage.includes('auth/weak-password')) {
        setError('Password should be at least 6 characters');
      } else if (errorMessage.includes('auth/invalid-email')) {
        setError('Invalid email address');
      } else {
        setError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSelect = async (hintIndex: number) => {
    if (!mfaState) return;
    setError('');
    setSubmitting(true);

    try {
      const hint = mfaState.hints[hintIndex];
      if (hint.factorId === PhoneAuthProvider.PROVIDER_ID) {
        // Phone MFA - need to send code
        await sendMfaCode(hintIndex, 'recaptcha-container');
        setMfaCodeSent(true);
      } else {
        // TOTP MFA - can enter code directly
        await sendMfaCode(hintIndex, 'recaptcha-container');
        setMfaCodeSent(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send verification code';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await verifyMfaCode(mfaCode);
      // onAuthStateChanged will handle redirect
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
      if (errorMessage.includes('auth/invalid-verification-code')) {
        setError('Invalid verification code. Please try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMfa = () => {
    cancelMfa();
    setError('');
    setMfaCode('');
    setMfaCodeSent(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  // MFA verification UI
  if (mfaState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-700 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">FD</span>
            </div>
            <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
            <CardDescription>
              {mfaCodeSent
                ? 'Enter the verification code to complete sign-in.'
                : 'Select a verification method to continue.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!mfaCodeSent ? (
              // Step 1: Select MFA method
              <div className="space-y-3">
                {mfaState.hints.map((hint, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="w-full justify-start h-auto py-3"
                    onClick={() => handleMfaSelect(index)}
                    disabled={submitting}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">
                        {hint.factorId === PhoneAuthProvider.PROVIDER_ID
                          ? 'SMS Code'
                          : 'Authenticator App'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {hint.factorId === PhoneAuthProvider.PROVIDER_ID
                          ? `Send code to ${hint.phoneNumber || 'phone'}`
                          : hint.displayName || 'Enter code from your authenticator app'}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            ) : (
              // Step 2: Enter verification code
              <form onSubmit={handleMfaVerify} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder="Enter verification code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                  />
                </div>
                {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? 'Verifying...' : 'Verify'}
                </Button>
              </form>
            )}

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleCancelMfa}
                className="text-sm text-muted-foreground hover:underline"
              >
                Cancel and return to sign in
              </button>
            </div>

            {/* Hidden recaptcha container */}
            <div id="recaptcha-container" ref={recaptchaContainerRef}></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal login UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-700 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">FD</span>
          </div>
          <CardTitle className="text-2xl">First Dollar MCP Server</CardTitle>
          <CardDescription>
            Access Partner API tools through a visual interface, chat with AI, or connect your AI agents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-sm text-muted-foreground hover:underline"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
