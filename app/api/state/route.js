import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { normalizeState } from '@/lib/state';

export const runtime = 'nodejs';
async function collection() {
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || 'icoswa_dues').collection('application_state');
}
export async function GET() {
  try {
    const col = await collection();
    const doc = await col.findOne({ _id: 'main' });
    return NextResponse.json(normalizeState(doc?.data));
  } catch (e) {
    console.error('MongoDB read failed:', e);
    return NextResponse.json({ error: 'Could not connect to the database. Check MONGODB_URI and your database network access.' }, { status: 503 });
  }
}
export async function PUT(request) {
  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.teachers) || !Array.isArray(body.payments) || !Array.isArray(body.allocations)) {
      return NextResponse.json({ error: 'Invalid data format.' }, { status: 400 });
    }
    if (body.teachers.length > 10000 || body.payments.length > 100000) return NextResponse.json({ error: 'Data limit exceeded.' }, { status: 413 });
    const safe = normalizeState(body);
    safe.settings.monthlyDues = Number(safe.settings.monthlyDues) || 0;
    safe.settings.nextReceipt = Math.max(1, Number(safe.settings.nextReceipt) || 1);
    const col = await collection();
    await col.updateOne({ _id: 'main' }, { $set: { data: safe, updatedAt: new Date() } }, { upsert: true });
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('MongoDB write failed:', e);
    return NextResponse.json({ error: 'Could not save to MongoDB. Check your connection and try again.' }, { status: 503 });
  }
}
