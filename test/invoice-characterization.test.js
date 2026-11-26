'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

function item(overrides) {
  return Object.assign({
    id: 1,
    name: 'Rice',
    sku: 'RICE-1',
    hsn: '1006',
    price: 1000,
    qty: 1
  }, overrides || {});
}

function order(overrides) {
  return Object.assign({
    id: 42,
    date: '2026-11-26',
    customer: 'Test Customer',
    paymentMode: 'cash',
    status: 'completed',
    items: [item()],
    coupon: '',
    subtotal: 1000,
    discount: 0,
    tax: 50,
    total: 1050
  }, overrides || {});
}

test('invoice uses the same HSN slab as pricing', function () {
  var line = item();
  var ledgerFigures = pricing.computeTotals([line], '');
  var invoiceFigures = invoice.computeInvoiceFigures(order({ items: [line] }));

  assert.equal(ledgerFigures.tax, 50);
  assert.equal(ledgerFigures.total, 1050);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.tax, 50);
  assert.equal(invoiceFigures.total, 1050);
});

test('invoice uses the same capped subtotal coupon calculation as pricing', function () {
  var line = item();
  var ledgerFigures = pricing.computeTotals([line], 'WELCOME');
  var invoiceFigures = invoice.computeInvoiceFigures(order({ items: [line], coupon: 'WELCOME' }));

  assert.deepEqual(
    { discount: ledgerFigures.discount, tax: ledgerFigures.tax, total: ledgerFigures.total },
    { discount: 50, tax: 47.5, total: 997.5 }
  );
  assert.deepEqual(
    { discount: invoiceFigures.discount, tax: invoiceFigures.tax, total: invoiceFigures.total },
    { discount: 50, tax: 47.5, total: 997.5 }
  );
});

test('invoice treats decimal gstRate values as decimal rates like pricing', function () {
  var line = item({ gstRate: 0.05 });
  var ledgerFigures = pricing.computeTotals([line], '');
  var invoiceFigures = invoice.computeInvoiceFigures(order({ items: [line] }));

  assert.equal(ledgerFigures.tax, 50);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.tax, 50);
  assert.equal(invoiceFigures.total, 1050);
});

test('GST reconciliation matches the stored ledger when invoice calculations use pricing rules', function () {
  var savedOrder = order({ items: [item()], total: 1050, tax: 50 });
  var result = reports.getGstReconciliation({ orders: [savedOrder] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.deepEqual(
    {
      invoiceDiscount: result.rows[0].invoiceDiscount,
      invoiceTax: result.rows[0].invoiceTax,
      invoiceTotal: result.rows[0].invoiceTotal,
      delta: result.rows[0].delta,
      matched: result.rows[0].matched
    },
    { invoiceDiscount: 0, invoiceTax: 50, invoiceTotal: 1050, delta: 0, matched: true }
  );
});

test('rendered invoice shows the ledger total without a false reconciliation warning', function () {
  var html = invoice.render(order());

  assert.match(html, /GST Amt<\/th>/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹1050\.00/);
  assert.doesNotMatch(html, /Order Ledger recorded total/);
});
