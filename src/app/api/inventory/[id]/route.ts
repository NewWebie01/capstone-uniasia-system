import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = Number(params.id);
    const b = await req.json();
    const item = b?.item || {};

    // Dito natin iche-check kung pumapasok ba ang data
    console.log('RECEIVED DATA:', item);

    const cols = [
      'sku',
      'product_name',
      'category',
      'subcategory',
      'unit',
      'size',
      'quantity',
      'unit_price',
      'cost_price',
      'markup_percent',
      'discount_percent',
      'amount',
      'profit',
      'date_created',
      'status',
      'image_url',
      'weight_per_piece_kg',
      'pieces_per_unit',
      'total_weight_kg',
      'expiration_date',
      'ceiling_qty',
      'stock_level',
      'min_order_qty',
    ];

    // GAMITIN ANG '?' PLACEHOLDERS (MySQL Syntax)
    const setClause = cols.map((c) => `${c} = ?`).join(', ');
    const values = cols.map((c) => item[c] ?? null);
    values.push(id);

    const sql = `UPDATE inventory SET ${setClause} WHERE id = ?`;

    // I-LOG NATIN ANG QUERY PARA MAKITA NATIN SA TERMINAL
    console.log('EXECUTING SQL:', sql);
    console.log('VALUES:', values);

    await pool.query(sql, values);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('PUT API ERROR:', e); // Dito lalabas ang tunay na dahilan kung bakit hindi nag-se-save
    return NextResponse.json(
      { error: e?.message || 'Failed to update item.' },
      { status: 500 },
    );
  }
}
