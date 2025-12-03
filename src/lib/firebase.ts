import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBfCRN8coHEkpEHZMX-xlNOeE5186r3CIU',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'first-dollar-app-dev.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'first-dollar-app-dev',
};

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// Secondary Firebase app for Partner API authentication
// This allows us to maintain the admin's auth state while also authenticating as the Partner API user
const PARTNER_API_APP_NAME = 'partner-api';
let partnerApiApp: ReturnType<typeof initializeApp> | null = null;
let partnerApiAuth: Auth | null = null;

function getPartnerApiAuth(): Auth {
    if (!partnerApiAuth) {
        // Check if the app already exists
        try {
            partnerApiApp = getApp(PARTNER_API_APP_NAME);
        } catch {
            // App doesn't exist, create it
            partnerApiApp = initializeApp(firebaseConfig, PARTNER_API_APP_NAME);
        }
        partnerApiAuth = getAuth(partnerApiApp);
    }
    return partnerApiAuth;
}

export { app, auth, getPartnerApiAuth };
