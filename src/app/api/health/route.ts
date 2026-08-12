export async function GET() {
  return NextResponse.json({ ok: true, timestamp: Date.now() });
}