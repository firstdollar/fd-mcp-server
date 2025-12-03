'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithCustomToken,
  MultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  MultiFactorError,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth, getPartnerApiAuth } from './firebase';

interface Partner {
  shortCode: string;
  name: string;
}

interface PartnerApiToken {
  /** The Partner API ID token */
  token: string;
  /** When the token was obtained */
  obtainedAt: number;
  /** The partner code this token is for */
  partnerCode: string;
}

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
  /** Gets the admin's Firebase ID token (for admin-level operations) */
  getIdToken: () => Promise<string | null>;
  /** Gets a Partner API token for making Partner API calls */
  getPartnerApiToken: () => Promise<string | null>;
  /** The current partner code (if available) */
  partnerCode: string | null;
  /** Error from Partner API token exchange (if any) */
  partnerApiError: string | null;
  /** MFA state when multi-factor auth is required */
  mfaState: MfaState | null;
  /** Send MFA verification code (for phone-based MFA) */
  sendMfaCode: (hintIndex: number, recaptchaContainerId: string) => Promise<void>;
  /** Verify MFA code and complete sign-in */
  verifyMfaCode: (code: string) => Promise<void>;
  /** Cancel MFA flow */
  cancelMfa: () => void;
  /** Whether the current user is an FD Admin with access to all partners */
  isFdAdmin: boolean;
  /** List of partners the user has access to */
  availablePartners: Partner[];
  /** Currently selected partner (for FD Admins) */
  selectedPartner: string | null;
  /** Set the selected partner (for FD Admins) */
  setSelectedPartner: (partnerCode: string) => void;
  /** Whether partners are being loaded */
  loadingPartners: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token is considered valid for 55 minutes (Firebase tokens expire in 1 hour)
const TOKEN_VALIDITY_MS = 55 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [partnerApiToken, setPartnerApiToken] = useState<PartnerApiToken | null>(null);
  const [partnerApiError, setPartnerApiError] = useState<string | null>(null);
  const [mfaState, setMfaState] = useState<MfaState | null>(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  // New state for partner selection
  const [isFdAdmin, setIsFdAdmin] = useState(false);
  const [availablePartners, setAvailablePartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartnerState] = useState<string | null>(null);
  const [loadingPartners, setLoadingPartners] = useState(false);

  // Fetch available partners when user logs in
  const fetchAvailablePartners = useCallback(async (userToken: string) => {
    setLoadingPartners(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.dev.firstdollar.com';
      const response = await fetch(`${apiUrl}/mcp/partners`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`,
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch partners:', response.status);
        return;
      }

      const data = await response.json();
      setIsFdAdmin(data.isFdAdmin);
      setAvailablePartners(data.partners);

      // If not an FD admin, auto-select their only partner
      if (!data.isFdAdmin && data.partners.length === 1) {
        setSelectedPartnerState(data.partners[0].shortCode);
      }
      // If FD admin and no partner selected yet, don't auto-select (let them choose)
    } catch (error) {
      console.error('Error fetching partners:', error);
    } finally {
      setLoadingPartners(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);

      // Clear state when user changes
      if (!user) {
        setPartnerApiToken(null);
        setPartnerApiError(null);
        setIsFdAdmin(false);
        setAvailablePartners([]);
        setSelectedPartnerState(null);
      } else {
        // Fetch available partners when user logs in
        setMfaState(null);
        const token = await user.getIdToken();
        if (token) {
          fetchAvailablePartners(token);
        }
      }
    });

    return () => unsubscribe();
  }, [fetchAvailablePartners]);

  // When selected partner changes, clear the cached token so a new one is fetched
  const setSelectedPartner = useCallback((partnerCode: string) => {
    setSelectedPartnerState(partnerCode);
    // Clear cached token so getPartnerApiToken fetches a new one for the selected partner
    setPartnerApiToken(null);
    setPartnerApiError(null);
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
      // Also sign out from Partner API auth
      const partnerAuth = getPartnerApiAuth();
      await firebaseSignOut(partnerAuth);
      setPartnerApiToken(null);
      setPartnerApiError(null);
      setMfaState(null);
      setIsFdAdmin(false);
      setAvailablePartners([]);
      setSelectedPartnerState(null);
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

  /**
   * Gets a Partner API token by:
   * 1. Calling the MCP token exchange endpoint with the admin's token
   * 2. Exchanging the custom token for an ID token using a secondary Firebase app
   * 3. Caching the token for subsequent calls
   *
   * The secondary Firebase app allows us to maintain the admin's auth state
   * while also authenticating as the Partner API user.
   */
  const getPartnerApiToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;

    // For FD Admins, they must select a partner first
    if (isFdAdmin && !selectedPartner) {
      setPartnerApiError('Please select a partner first');
      return null;
    }

    // Return cached token if still valid AND for the same partner
    if (
      partnerApiToken &&
      Date.now() - partnerApiToken.obtainedAt < TOKEN_VALIDITY_MS &&
      partnerApiToken.partnerCode === (selectedPartner || partnerApiToken.partnerCode)
    ) {
      return partnerApiToken.token;
    }

    try {
      setPartnerApiError(null);

      // Step 1: Get admin's ID token
      const adminToken = await user.getIdToken();
      if (!adminToken) {
        throw new Error('Failed to get admin token');
      }

      // Step 2: Call the token exchange endpoint
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.dev.firstdollar.com';

      // Include partner code in request for FD Admins
      const requestBody: { idToken: string; partnerCode?: string } = { idToken: adminToken };
      if (isFdAdmin && selectedPartner) {
        requestBody.partnerCode = selectedPartner;
      }

      const exchangeResponse = await fetch(`${apiUrl}/mcp/token-exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!exchangeResponse.ok) {
        const errorData = await exchangeResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Token exchange failed: ${exchangeResponse.status}`);
      }

      const { customToken, partnerCode } = await exchangeResponse.json();

      // Step 3: Exchange custom token for ID token using the SECONDARY Firebase app
      // This preserves the admin's auth state in the primary app
      const partnerAuth = getPartnerApiAuth();
      const userCredential = await signInWithCustomToken(partnerAuth, customToken);
      const partnerIdToken = await userCredential.user.getIdToken();

      // Cache the Partner API token
      const newToken: PartnerApiToken = {
        token: partnerIdToken,
        obtainedAt: Date.now(),
        partnerCode,
      };
      setPartnerApiToken(newToken);

      console.log(`Partner API token obtained for partner: ${partnerCode}`);

      return partnerIdToken;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get Partner API token';
      console.error('Partner API token error:', error);
      setPartnerApiError(errorMessage);
      return null;
    }
  }, [user, partnerApiToken, isFdAdmin, selectedPartner]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        getIdToken,
        getPartnerApiToken,
        partnerCode: partnerApiToken?.partnerCode ?? null,
        partnerApiError,
        mfaState,
        sendMfaCode,
        verifyMfaCode,
        cancelMfa,
        isFdAdmin,
        availablePartners,
        selectedPartner,
        setSelectedPartner,
        loadingPartners,
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
