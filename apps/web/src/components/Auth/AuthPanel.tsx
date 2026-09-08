"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import styles from "./AuthPanel.module.css";

export function AuthPanel() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      return;
    }
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return <p className={styles.muted}>טוען…</p>;
  }

  if (!isSupabaseConfigured()) {
    return (
      <p className={styles.muted}>
        חיבור למשתמשים עדיין לא הוגדר בסביבה זו.
      </p>
    );
  }

  const user = session?.user ?? null;

  async function signInEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/account` : undefined,
        data: displayName.trim()
          ? { display_name: displayName.trim() }
          : undefined,
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("נשלח קישור התחברות למייל. בדקו גם בספאם.");
  }

  async function signInGuest() {
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInAnonymously({
      options: {
        data: {
          display_name: displayName.trim() || "אורח",
        },
      },
    });
    setBusy(false);
    if (error) {
      setMessage(
        error.message.includes("anonymous")
          ? "התחברות כאורח לא מופעלת עדיין ב־Supabase (Authentication → Providers → Anonymous)."
          : error.message,
      );
      return;
    }
  }

  async function signOut() {
    setBusy(true);
    await getSupabase().auth.signOut();
    setBusy(false);
  }

  if (user) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>החשבון שלי</h1>
        <p className={styles.body}>
          מחוברים כ־{labelFor(user)}
        </p>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => void signOut()}
        >
          התנתקות
        </button>
        <Link className={styles.link} href="/">
          ← חזרה לדף הבית
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>התחברות</h1>
      <p className={styles.body}>
        שמרו התקדמות ובעתיד גם דירוג ומשחקים אונליין.
      </p>

      <label className={styles.label}>
        שם תצוגה (אופציונלי)
        <input
          className={styles.input}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="למשל: אבי"
          autoComplete="nickname"
        />
      </label>

      <form className={styles.form} onSubmit={(e) => void signInEmail(e)}>
        <label className={styles.label}>
          אימייל
          <input
            className={styles.input}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <button type="submit" className={styles.primary} disabled={busy}>
          שלחו קישור התחברות
        </button>
      </form>

      <button
        type="button"
        className={styles.secondary}
        disabled={busy}
        onClick={() => void signInGuest()}
      >
        המשך כאורח
      </button>

      {message && <p className={styles.message}>{message}</p>}

      <Link className={styles.link} href="/">
        ← חזרה לדף הבית
      </Link>
    </div>
  );
}

function labelFor(user: User): string {
  const meta = user.user_metadata?.display_name;
  if (typeof meta === "string" && meta.trim()) return meta;
  if (user.email) return user.email;
  if (user.is_anonymous) return "אורח";
  return user.id.slice(0, 8);
}
