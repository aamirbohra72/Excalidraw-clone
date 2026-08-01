"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignUp, useAuth } from "@clerk/nextjs";
import styles from "../../auth.module.css";

export default function SignUpPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/");
    }
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
        </div>
      </main>
    );
  }

  return (
    <main className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authBrand}>
          <strong>DrawApp</strong>
          <p>Create an account to save your diagrams</p>
        </div>
        <SignUp
          routing="hash"
          signInUrl="/sign-in"
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
