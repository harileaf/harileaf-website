import { expect, it } from 'vitest';
import { parseCsv, remittanceRows } from '../../src/lib/store/remittance';

it('parses quoted CSV with commas, escaped quotes and CRLF', () => {
  expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n3,4')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['3', '4']]);
});

it('finds the columns in a Shiprocket remittance report', () => {
  const csv = 'Remittance Date,CRF ID,AWB Code,Channel Order ID,COD Amount,Freight Charges\n18-10-2026,UTR123,AWB9,hl-2610-0001,"₹1,299.50",80';
  expect(remittanceRows(csv)).toEqual({ rows: [{ awb: 'AWB9', orderNo: 'HL-2610-0001', amountPaise: 129950, remittedOn: '18-10-2026', utr: 'UTR123' }] });
  expect(remittanceRows('foo,bar\n1,2').error).toMatch(/columns/);
});
