'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  MultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  MultiFactorError,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth } from './firebase';


/** MFA state when second factor is required */
interface MfaState {
  /** The resolver to complete MFA */
  resolver: MultiFactorResolver;
  /** Available MFA hints (phone number, TOTP, etc.) */
  hints: Array<{
    index: number;
    factorId: string;
    displayName: string | null | undefined;
    phoneNumber?: string;
  }>;
  /** The verification ID for phone-based MFA (after code is sent) */
  verificationId?: string;
  /** The selected hint index */
  selectedHintIndex?: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Gets the user's Firebase ID token (for API calls) */
  getIdToken: () => Promise<string | null>;
  /** MFA state when multi-factor auth is required */
  mfaState: MfaState | null;
  /** Send MFA verification code (for phone-based MFA) */
  sendMfaCode: (hintIndex: number, recaptchaContainerId: string) => Promise<void>;
  /** Verify MFA code and complete sign-in */
  verifyMfaCode: (code: string) => Promise<void>;
  /** Cancel MFA flow */
  cancelMfa: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaState, setMfaState] = useState<MfaState | null>(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);

      // Clear MFA state when user signs in
      if (user) {
        setMfaState(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      // Check if MFA is required
      if ((error as MultiFactorError)?.code === 'auth/multi-factor-auth-required') {
        const mfaError = error as MultiFactorError;
        const resolver = getMultiFactorResolver(auth, mfaError);

        // Extract hints for the UI
        const hints = resolver.hints.map((hint, index) => ({
          index,
          factorId: hint.factorId,
          displayName: hint.displayName,
          phoneNumber: hint.factorId === PhoneAuthProvider.PROVIDER_ID
            ? (hint as { phoneNumber?: string }).phoneNumber
            : undefined,
        }));

        setMfaState({ resolver, hints });
        // Don't throw - let the UI handle MFA
        return;
      }
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setMfaState(null);
    } catch (error) {
      throw error;
    }
  };

  /**
   * Send MFA verification code for phone-based MFA
   */
  const sendMfaCode = async (hintIndex: number, recaptchaContainerId: string): Promise<void> => {
    if (!mfaState) {
      throw new Error('No MFA session active');
    }

    const hint = mfaState.resolver.hints[hintIndex];
    if (!hint) {
      throw new Error('Invalid MFA hint index');
    }

    if (hint.factorId === PhoneAuthProvider.PROVIDER_ID) {
      // Phone-based MFA - need to send SMS code
      // Clean up existing recaptcha verifier
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
      }

      const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
        size: 'invisible',
      });
      setRecaptchaVerifier(verifier);

      const phoneInfoOptions = {
        multiFactorHint: hint,
        session: mfaState.resolver.session,
      };

      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, verifier);

      setMfaState({
        ...mfaState,
        verificationId,
        selectedHintIndex: hintIndex,
      });
    } else if (hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
      // TOTP-based MFA - just need to set the selected hint, user enters code from authenticator app
      setMfaState({
        ...mfaState,
        selectedHintIndex: hintIndex,
      });
    } else {
      throw new Error(`Unsupported MFA factor: ${hint.factorId}`);
    }
  };

  /**
   * Verify MFA code and complete sign-in
   */
  const verifyMfaCode = async (code: string): Promise<void> => {
    if (!mfaState || mfaState.selectedHintIndex === undefined) {
      throw new Error('No MFA session active or no factor selected');
    }

    const hint = mfaState.resolver.hints[mfaState.selectedHintIndex];

    if (hint.factorId === PhoneAuthProvider.PROVIDER_ID) {
      // Phone-based MFA
      if (!mfaState.verificationId) {
        throw new Error('No verification ID - please request a new code');
      }

      const cred = PhoneAuthProvider.credential(mfaState.verificationId, code);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
      await mfaState.resolver.resolveSignIn(multiFactorAssertion);
    } else if (hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
      // TOTP-based MFA
      const multiFactorAssertion = TotpMultiFactorGenerator.assertionForSignIn(
        hint.uid,
        code,
      );
      await mfaState.resolver.resolveSignIn(multiFactorAssertion);
    } else {
      throw new Error(`Unsupported MFA factor: ${hint.factorId}`);
    }

    // Clean up recaptcha verifier
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      setRecaptchaVerifier(null);
    }

    // MFA state will be cleared by onAuthStateChanged when user signs in
  };

  /**
   * Cancel MFA flow and return to login
   */
  const cancelMfa = () => {
    setMfaState(null);
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      setRecaptchaVerifier(null);
    }
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch (error) {
      console.error('Get ID token error:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        getIdToken,
        mfaState,
        sendMfaCode,
        verifyMfaCode,
        cancelMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
