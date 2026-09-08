"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import styles from "./AuthPanel.module.css";

type Mode = "signin" | "signup";

function authHint(message: string): string {
  if (message === "Failed to fetch") {
    return " לא מצליחים להגיע ל־Supabase — בדקו את כתובת הפרויקט והמפתח, ואז בנייה מחדש.";
  }
  if (/invalid login credentials/i.test(message)) {
    return " אימייל או סיסמה שגויים.";
  }
  if (/user already registered/i.test(message)) {
    return " כבר קיים חשבון עם האימייל הזה — התחברו.";
  }
  if (/password/i.test(message) && /at least|weak|characters/i.test(message)) {
    return " הסיסמה קצרה מדי (לפחות 6 תווים).";
  }
  if (/email rate limit/i.test(message)) {
    return " נשלחו יותר מדי מיילים — המתינו כמה דקות.";
  }
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return " ספק ההתחברות לא מופעל עדיין ב־Supabase (Authentication → Providers).";
  }
  return "";
}

export function AuthPanel() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  function showError(error: { message: string }) {
    const hint = authHint(error.message);
    setMessage(hint.trim() || error.message);
  }

  async function signInPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      showError(error);
      return;
    }
  }

  async function signUpPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: displayName.trim()
          ? { display_name: displayName.trim() }
          : undefined,
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/account`
            : undefined,
      },
    });
    setBusy(false);
    if (error) {
      showError(error);
      return;
    }
    if (data.session) {
      setMessage(null);
      return;
    }
    setMessage(
      "נרשמתם בהצלחה. אם נדרש אימות מייל — בדקו את תיבת הדואר (וגם ספאם), אחרת התחברו עם הסיסמה.",
    );
    setMode("signin");
  }

  async function signInGoogle() {
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/account`
            : undefined,
      },
    });
    if (error) {
      setBusy(false);
      showError(error);
    }
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
      if (error.message.includes("anonymous") && !error.message.includes("Failed")) {
        setMessage(
          "התחברות כאורח לא מופעלת עדיין ב־Supabase (Authentication → Providers → Anonymous).",
        );
        return;
      }
      showError(error);
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
        <p className={styles.body}>מחוברים כ־{labelFor(user)}</p>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => void signOut()}
        >
          התנתקות
        </button>
        <Link className={styles.link} href="/play/online">
          למשחק אונליין →
        </Link>
        <Link className={styles.link} href="/">
          ← חזרה לדף הבית
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>
        {mode === "signin" ? "התחברות" : "הרשמה"}
      </h1>
      <p className={styles.body}>
        שמרו התקדמות, שחקו אונליין, ובעתיד גם דירוג.
      </p>

      <button
        type="button"
        className={styles.google}
        disabled={busy}
        onClick={() => void signInGoogle()}
      >
        המשך עם Google
      </button>

      <div className={styles.divider} aria-hidden>
        <span>או</span>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={mode === "signin" ? styles.tabActive : styles.tab}
          onClick={() => {
            setMode("signin");
            setMessage(null);
          }}
        >
          התחברות
        </button>
        <button
          type="button"
          className={mode === "signup" ? styles.tabActive : styles.tab}
          onClick={() => {
            setMode("signup");
            setMessage(null);
          }}
        >
          הרשמה
        </button>
      </div>

      <form
        className={styles.form}
        onSubmit={(e) =>
          void (mode === "signin" ? signInPassword(e) : signUpPassword(e))
        }
      >
        {mode === "signup" && (
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
        )}
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
        <label className={styles.label}>
          סיסמה
          <input
            className={styles.input}
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="לפחות 6 תווים"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
          />
        </label>
        <button type="submit" className={styles.primary} disabled={busy}>
          {mode === "signin" ? "התחברות" : "צרו חשבון"}
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
  const meta =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name;
  if (typeof meta === "string" && meta.trim()) return meta;
  if (user.email) return user.email;
  if (user.is_anonymous) return "אורח";
  return user.id.slice(0, 8);
}
