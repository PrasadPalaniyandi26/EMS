// The printed tax invoice, laid out like the company's Word template: a ruled box with the logo and company details on top,
// invoice and order details side by side, the item grid, tax lines, amount in words, payment instructions and notes.
// An invoice is paper: it is always black on white, whatever the theme of the app is. The same rules are used for the preview and the print window.
export const SHEET_CSS = `
.inv{box-sizing:border-box;width:210mm;min-height:297mm;margin:0 auto;padding:10mm;background:#fff;color:#000;font:11px/1.35 Arial,"Helvetica Neue",Helvetica,sans-serif;position:relative;overflow:clip;-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.inv *{box-sizing:border-box}
.inv b{font-weight:700}
.inv .sheet{border:1px solid #000}
.inv .title{text-align:center;font-weight:700;font-size:12px;padding:2px 0;border-bottom:1px solid #000}
.inv .head{display:grid;grid-template-columns:28% 1fr;border-bottom:1px solid #000}
.inv .head.nologo{grid-template-columns:1fr}
.inv .logo{display:flex;align-items:center;justify-content:center;padding:6px 10px;border-right:1px solid #000}
.inv .logo img{max-width:100%;max-height:26mm;object-fit:contain;filter:drop-shadow(0 0.6px 0 rgba(255,255,255,.95)) drop-shadow(0 -0.5px 0 rgba(0,0,0,.35))}
.inv .from{padding:4px 8px;font-weight:700;font-size:11px;line-height:1.3;text-align:right}
.inv .from .co{color:#00603c}
.inv .from .contact{color:#1f6feb}
.inv .from .ico{display:inline-block;vertical-align:-1px;margin-right:1px}
.inv .info{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #000}
.inv .info .l{border-right:1px solid #000;display:flex;flex-direction:column}
.inv .info .l .c{padding:5px 7px;border-bottom:1px solid #000}
.inv .info .l .buyer{padding:5px 7px;border-bottom:1px solid #000}
.inv .info .side{display:grid;grid-template-columns:1fr 1fr;align-content:start}
.inv .info .side .c{padding:3px 7px;border-bottom:1px solid #000;min-height:11mm}
.inv .info .side .c:nth-child(odd){border-right:1px solid #000}
.inv .info .side .c.wide{grid-column:1/-1;border-right:0;border-bottom:0}
.inv .consignee{padding:5px 7px;flex:1;min-height:22mm}
.inv .lab{display:block;font-size:10px;color:#222}
.inv .val{display:block;font-weight:700;overflow-wrap:anywhere}
.inv table{width:100%;border-collapse:collapse;table-layout:fixed}
.inv th{font-weight:700;text-align:center;border-left:1px solid #000;border-bottom:1px solid #000;padding:3px 4px;background:#f2f2f2}
.inv th:first-child,.inv td:first-child{border-left:0}
.inv td{border-left:1px solid #000;padding:2px 6px;vertical-align:top;overflow-wrap:anywhere}
.inv tbody td{border-bottom:1px solid #d6d6d6;height:5.6mm}
.inv tbody tr:last-child td{border-bottom:0}
.inv tbody.totals td{border-top:1px solid #000;border-bottom:0;font-weight:700}
.inv tbody.totals tr+tr td{border-top:0}
.inv tbody.totals .sep-above td{border-top:1px solid #000}
.inv tbody.totals .words-row td{border-top:1px solid #000;font-weight:400;text-align:left;padding:3px 7px}
.inv tbody.totals .words-row td.r{text-align:right}
.inv tbody.totals .words-row td.words-text{font-weight:700}
.inv tbody.totals .total-row td{border-top:2px solid #000;border-bottom:2px solid #000;font-size:12px;font-weight:700}
.inv .c-sl{text-align:center}
.inv .r{text-align:right;font-variant-numeric:tabular-nums}
.inv .words{border-top:1px solid #000}
.inv .words .row{display:flex;justify-content:space-between;padding:2px 7px}
.inv .words .row.w{border-top:1px solid #000;border-bottom:1px solid #000;font-weight:700;padding:3px 7px}
.inv .grand{display:flex;justify-content:flex-end;align-items:stretch;border-bottom:1px solid #000;font-weight:700}
.inv .grand span{padding:2px 8px}
.inv .grand .amt{border-left:1px solid #000;border-right:0;min-width:52mm;text-align:right;font-variant-numeric:tabular-nums}
.inv .pay{padding:4px 7px 6px;border-bottom:1px solid #000}
.inv .pay div{line-height:1.45}
.inv .pay-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.inv .pay-cols>div{min-width:0}
.inv .pay-cols>div:last-child{text-align:right}
.inv .pay h2{margin:0 0 1px;font-size:11px;font-weight:700}
.inv .foot{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #000;min-height:26mm}
.inv .notes{padding:3px 7px;border-right:1px solid #000}
.inv .notes h2{margin:0 0 2px;font-size:10px;font-weight:400}
.inv .notes div{white-space:pre-line}
.inv .sign{padding:3px 7px;text-align:right;display:flex;flex-direction:column;justify-content:space-between}
.inv .sign .gap{height:12mm}
.inv .tag{text-align:center;font-style:italic;color:#155e75;padding:3px 8px;border-top:0}
.inv .mark{contain:paint;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:110px;font-weight:800;letter-spacing:.1em;color:rgba(160,0,0,.12);transform:rotate(-30deg)}
.inv .muted{color:#444}
.inv .words,.inv .pay,.inv .foot,.inv .grand,.inv tr{break-inside:avoid}
@page{size:A4;margin:10mm 0}
@media print{body{margin:0}.inv{box-shadow:none;padding:0 10mm;min-height:0}}
`;
