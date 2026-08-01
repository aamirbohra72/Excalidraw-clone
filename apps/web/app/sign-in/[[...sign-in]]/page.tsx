"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignIn, SignInButton, useAuth } from "@clerk/nextjs";
import styles from "../../auth.module.css";

export default function SignInPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const target =
      new URLSearchParams(window.location.search).get("redirect_url") || "/";
    router.replace(target.startsWith("http") ? "/" : target);
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <main className={styles.authPage}>
        <p className={styles.authLoading}>Loading…</p>
      </main>
    );
  }

  if (isSignedIn) {
    return (
      <main className={styles.authPage}>
        <div className={styles.authSignedIn}>
          <p>Signed in — opening workspace…</p>
          <button
            type="button"
            className={styles.authPrimaryButton}
            onClick={() => router.replace("/")}
          >
            Open workspace
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authBrand}>
          <strong>DrawApp</strong>
          <p>Sign in to open your workspace</p>
        </div>

        <SignInButton mode="modal" forceRedirectUrl="/" fallbackRedirectUrl="/">
          <button type="button" className={styles.authPrimaryButton}>
            Continue with email or Google
          </button>
        </SignInButton>

        <p className={styles.authHint}>or use the form below</p>

        <SignIn
          routing="hash"
          signUpUrl="/sign-up"
          forceRedirectUrl="/"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: styles.clerkCard,
            },
          }}
        />
      </div>
    </main>
  );
}
