// Last Updated: Debug Mode Enabled
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. DEBUG: Capture which keys exist (without revealing secrets)
    // We check every possible name Vercel might use.
    const urlCheck = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const keyCheck = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 2. SPECIFIC ERROR REPORTING
    // If this fails, the browser will tell you exactly which one is empty.
    if (!urlCheck) {
      return NextResponse.json({ 
        error: 'CRITICAL ERROR: Database URL is missing.',
        details: 'Checked SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL. Both are empty.'
      }, { status: 500 });
    }

    if (!keyCheck) {
      return NextResponse.json({ 
        error: 'CRITICAL ERROR: Service Role Key is missing.',
        details: 'Checked SUPABASE_SERVICE_ROLE_KEY. It is empty.'
      }, { status: 500 });
    }

    // 3. Initialize Database
    const supabase = createClient(urlCheck, keyCheck, { auth: { persistSession: false } });
    const PAIR = "0xeAd0d2751d20c83d6EE36f6004f2aA17637809Cf".toLowerCase();

    // 4. Get Last Timestamp
    const { data: latest } = await supabase
      .from('swaps')
      .select('timestamp')
      .eq('pair', PAIR)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    const lastTs = latest?.timestamp || 0;

    // 5. Fetch from PulseChain
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
    const swaps = j.data?.swaps || [];

    if (swaps.length === 0) return NextResponse.json({ message: 'No new swaps found.' });

    // 6. Save Swaps
    const rows = swaps.map((s: any) => ({
      id: s.id,
      timestamp: Number(s.timestamp),
      sender: s.sender,
      to_address: s.to,
      amount0_in: s.amount0In,
      amount0_out: s.amount0Out,
      amount1_in: s.amount1In,
      amount1_out: s.amount1Out,
      amount_usd: s.amountUSD,
      token0_symbol: s.token0?.symbol || 'UNK',
      token1_symbol: s.token1?.symbol || 'UNK',
      type: (parseFloat(s.amount0In) > 0 && parseFloat(s.amount1Out) > 0) ? "BUY" : "SELL",
      pair: PAIR
    }));

    const { error } = await supabase.from('swaps').upsert(rows, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ message: `Success: Synced ${rows.length} swaps` });

  } catch (err: any) {
    return NextResponse.json({ error: `Server Error: ${err.message}` }, { status: 500 });
  }
}
