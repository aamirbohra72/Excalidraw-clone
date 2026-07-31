import styles from "../board.module.css";

export default function BoardLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.boardLoadingShell} aria-busy="true" aria-label="Loading board">
        <div className={styles.boardLoadingTop} />
        <div className={styles.boardLoadingBody}>
          <div className={styles.boardLoadingRail} />
          <div className={styles.boardLoadingCanvas}>
            <div className={styles.boardLoadingPulse} />
            <p className={styles.boardLoadingText}>Opening canvas…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
