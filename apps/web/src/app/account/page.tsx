import { AuthPanel } from "@/components/Auth/AuthPanel";
import styles from "../page.module.css";

export default function AccountPage() {
  return (
    <main className={styles.hero}>
      <AuthPanel />
    </main>
  );
}
