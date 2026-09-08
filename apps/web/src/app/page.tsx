import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.hero}>
      <div className={styles.frame}>
        <p className={styles.eyebrow}>משחק אסטרטגיה</p>
        <h1 className={styles.title}>HALCON-TORO</h1>
        <p className={styles.lead}>
          העבירו את ארבעת הכלים המלכותיים לאזור היעד של היריב. קפיצות לפי צבע,
          תכנון ומסלולים — על לוח אחד, שני שחקנים.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/play/tutorial">
            הדרכה
          </Link>
          <Link className={styles.secondary} href="/play/ai">
            משחק מול המחשב
          </Link>
          <Link className={styles.secondary} href="/play/local">
            משחק מקומי לשניים
          </Link>
          <Link className={styles.secondary} href="/play/online">
            משחק אונליין
          </Link>
          <Link className={styles.secondary} href="/account">
            התחברות
          </Link>
        </div>
        <p className={styles.credit}>הומצא בידי Amit Hilu</p>
      </div>
    </main>
  );
}
