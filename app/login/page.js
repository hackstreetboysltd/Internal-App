'use client';

import { Suspense } from "react";
import LoginPage from "./LoginClient";

export default function LoginPageWrapper() {
    return (
        <Suspense fallback={null}>
            <LoginPage />
        </Suspense>
    );
}
