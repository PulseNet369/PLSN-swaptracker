// @ts-ignore
import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import { NextResponse } from 'next/server';

// @ts-ignore
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Setup Database Connection
    // @ts-ignore
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL;
    // @ts-ignore
    const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!dbUrl || !dbKey) {
      return NextResponse.json({ error: 'Missing Database Keys' }, { status: 500 });
    }

    const supabase = createClient(dbUrl, dbKey, { auth: { persistSession: false } });
    const PAIR = "0xeAd0d2751d20c83d6EE36f6004f2aA17637809Cf".toLowerCase();

    // 2. Get the Last Timestamp
    const { data: latest } = await supabase
      .from('swaps')
      .select('timestamp')
      .eq('pair', PAIR)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    const lastTs = latest?.timestamp || 0;

    // 3. Fetch New Data
    const query = `
      {
        swaps(
          first: 50
          orderBy: timestamp
          orderDirection: asc
          where: { pair: "${PAIR}", timestamp_gt: ${lastTs} }
        ) {
          id timestamp sender to amountUSD amount0In amount0Out amount1In amount1Out
          token0 { symbol }
          token1 { symbol }
        }
      }
    `;

    const res = await fetch("https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      cache: 'no-store'
    });

    const j = await res.json();
    // @ts-ignore
    const swaps = j.data?.swaps || [];

    if (swaps.length === 0) return NextResponse.json({ message: 'No new swaps' });

    // 4. Save to Database
    // @ts-ignore
    const rows = swaps.map((s) => ({
      id: s.id,
      timestamp: Number(s.timestamp),
      sender: s.sender,
      to_address: s.to,
      amount0_in: s.amount0In,
      amount0_out: s.amount0Out,
      amount1_in: s.amount1In,
      amount1_out: s.amount1Out,
      amount_usd: s.amountUSD,
      token0_symbol: s.token0.symbol,
      token1_symbol: s.token1.symbol,
      // @ts-ignore
      type: (parseFloat(s.amount0In) > 0 && parseFloat(s.amount1Out) > 0) ? "BUY" : "SELL",
      pair: PAIR
    }));

    const { error } = await supabase.from('swaps').upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ message: `Synced ${rows.length} swaps` });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
