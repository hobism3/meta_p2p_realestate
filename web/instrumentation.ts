export async function register(): Promise<void> {
  // 운영 Postgres(Supabase) 경로는 여기서 마이그레이션을 보장한다.
  // SQLite 경로는 getDb()가 열 때 이미 처리한다.
  if (process.env.DATABASE_URL) {
    const { getDal } = await import("./lib/dal.ts");
    await getDal().migrate();
  }
}
