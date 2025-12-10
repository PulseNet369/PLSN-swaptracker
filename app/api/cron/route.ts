// Last Updated: Fixed Start Time, Incremental IDs, Removed Pair
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. SETUP & KEYS
    const urlCheck = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const keyCheck = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!urlCheck || !keyCheck) {
      return NextResponse.json({ error: 'CRITICAL: Database keys missing.' }, { status: 500 });
    }

    const supabase = createClient(urlCheck, keyCheck, { auth: { persistSession: false } });
    const PAIR = "0xeAd0d2751d20c83d6EE36f6004f2aA17637809Cf".toLowerCase();
    
    // ** CONFIGURATION **
    // If DB is empty, start from June 10, 2024 13:30:00 UTC (1718026200)
    // This prevents fetching empty data from years ago.
    const START_TIMESTAMP = 1718026200; 

    // 2. GET LAST SYNC TIMESTAMP
    const { data: latest } = await supabase
      .from('swaps')
      .select('timestamp')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    // If we have data, use that timestamp. If empty, use our hardcoded Start Date.
    const lastTs = latest?.timestamp || START_TIMESTAMP;

    // 3. FETCH DATA (Includes Transaction Hash)
    const query = `
      {
        swaps(
          first: 50
          orderBy: timestamp
          orderDirection: asc
          where: { pair: "${PAIR}", timestamp_gt: ${lastTs} }
        ) {
          id 
          transaction { id } 
          timestamp 
          sender 
          to 
          amountUSD 
          amount0In amount0Out 
          amount1In amount1Out
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

    // 4. MAP DATA
    const rows = swaps.map((s: any) => ({
      // We do NOT send 'id'. We let Supabase generate 1, 2, 3...
      swap_id: s.id,                // Used for checking duplicates
      tx_hash: s.transaction.id,    // The Transaction Hash
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
      type: (parseFloat(s.amount0In) > 0 && parseFloat(s.amount1Out) > 0) ? "BUY" : "SELL"
    }));

    // 5. UPSERT
    // We match on 'swap_id' (the Graph ID) to stop duplicates.
    // We ignore the table's main 'id' so it stays incremental.
    const { error } = await supabase
      .from('swaps')
      .upsert(rows, { onConflict: 'swap_id' });

    if (error) throw error;

    return NextResponse.json({ message: `Success: Synced ${rows.length} swaps` });

  } catch (err: any) {
    return NextResponse.json({ error: `Server Error: ${err.message}` }, { status: 500 });
  }
}
