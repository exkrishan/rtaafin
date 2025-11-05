/**
 * GET /api/sub-dispositions
 *
 * Fetch sub-dispositions for a given disposition
 *
 * Query params:
 * - dispositionCode: optional filter by disposition code
 *
 * Returns:
 * {
 *   ok: true,
 *   subDispositions: [{ code: string, title: string }]
 * }
 */

import { NextResponse } from 'next/server';

// Common sub-dispositions (can be moved to DB later)
const SUB_DISPOSITIONS: Record<string, Array<{ code: string; title: string }>> = {
  // Credit Card related
  CREDIT_CARD: [
    { code: 'fraud', title: 'Fraud' },
    { code: 'block', title: 'Card Block' },
    { code: 'replacement', title: 'Card Replacement' },
    { code: 'limit_increase', title: 'Limit Increase' },
    { code: 'payment_issue', title: 'Payment Issue' },
    { code: 'statement', title: 'Statement Inquiry' },
  ],
  // Debit Card related
  DEBIT_CARD: [
    { code: 'fraud', title: 'Fraud' },
    { code: 'block', title: 'Card Block' },
    { code: 'replacement', title: 'Card Replacement' },
    { code: 'pin_reset', title: 'PIN Reset' },
    { code: 'transaction_dispute', title: 'Transaction Dispute' },
  ],
  // Account related
  ACCOUNT_ISSUE: [
    { code: 'balance_inquiry', title: 'Balance Inquiry' },
    { code: 'statement', title: 'Statement Request' },
    { code: 'transfer', title: 'Transfer Issue' },
    { code: 'closure', title: 'Account Closure' },
    { code: 'update_details', title: 'Update Account Details' },
  ],
  // Payment related
  PAYMENT: [
    { code: 'failed', title: 'Failed Payment' },
    { code: 'refund', title: 'Refund Request' },
    { code: 'dispute', title: 'Payment Dispute' },
    { code: 'reversal', title: 'Payment Reversal' },
  ],
  // Escalated
  ESCALATED: [
    { code: 'supervisor', title: 'Escalated to Supervisor' },
    { code: 'manager', title: 'Escalated to Manager' },
    { code: 'specialist', title: 'Escalated to Specialist' },
  ],
  // Default/Other
  OTHER: [
    { code: 'general_inquiry', title: 'General Inquiry' },
    { code: 'information', title: 'Information Request' },
    { code: 'complaint', title: 'Complaint' },
    { code: 'feedback', title: 'Feedback' },
  ],
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dispositionCode = url.searchParams.get('dispositionCode');

    let subDispositions: Array<{ code: string; title: string }> = [];

    if (dispositionCode) {
      // Get sub-dispositions for specific disposition
      const upperCode = dispositionCode.toUpperCase();
      
      // Try exact match first
      if (SUB_DISPOSITIONS[upperCode]) {
        subDispositions = SUB_DISPOSITIONS[upperCode];
      } else {
        // Try partial match (e.g., CREDIT_CARD_FRAUD -> CREDIT_CARD)
        const matchingKey = Object.keys(SUB_DISPOSITIONS).find(key => 
          upperCode.includes(key) || key.includes(upperCode)
        );
        if (matchingKey) {
          subDispositions = SUB_DISPOSITIONS[matchingKey];
        }
      }
    }

    // If no specific match or no code provided, return all unique sub-dispositions
    if (subDispositions.length === 0) {
      const allSubDispositions = new Map<string, string>();
      Object.values(SUB_DISPOSITIONS).forEach(list => {
        list.forEach(item => {
          if (!allSubDispositions.has(item.code)) {
            allSubDispositions.set(item.code, item.title);
          }
        });
      });
      subDispositions = Array.from(allSubDispositions.entries()).map(([code, title]) => ({
        code,
        title,
      }));
    }

    return NextResponse.json({
      ok: true,
      subDispositions,
      count: subDispositions.length,
    });
  } catch (err: any) {
    console.error('[api][sub-dispositions] Unexpected error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
