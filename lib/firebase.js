'use client';

import { initializeApp, getApps } from "firebase/app";
import {
    getAuth,
    signInWithPopup,
    signInWithCredential,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    GithubAuthProvider,
    signOut,
} from "firebase/auth";

/** Firebase is retained only for GitHub OAuth in github-connect (Apps changelogs). */
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

let app = null;
/** @type {import('firebase/auth').Auth | null} */
let auth = null;

try {
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
        auth = getAuth(app);
    }
} catch (e) {
    console.warn("Firebase Auth not configured.", e);
}

export const FirebaseAuth = {
    auth,
    signInWithPopup,
    signInWithCredential,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    GithubAuthProvider,
    signOut,
};

export function isFirebaseAuthConfigured() {
    return !!auth;
}
