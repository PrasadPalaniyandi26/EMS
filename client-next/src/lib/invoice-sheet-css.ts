// The printed invoice. Paper is always dark ink on white, so these colours are fixed and not taken from the app theme.
// An invoice is paper: it is always dark text on white, whatever the theme of the app is. The same rules are used for the preview and the print window.
export const SHEET_CSS = `
.inv{box-sizing:border-box;width:210mm;min-height:297mm;margin:0 auto;padding:14mm 14mm 12mm;background:#fff;color:#1a1a1a;font:12px/1.45 "Inter","Segoe UI",Arial,sans-serif;position:relative}
.inv *{box-sizing:border-box}
.inv h1{margin:0;font-size:20px;letter-spacing:.04em}
.inv .muted{color:#555}
.inv .top{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1a1a1a;padding-bottom:10px}
.inv .seller{max-width:60%}
.inv .seller .name{font-size:16px;font-weight:700}
.inv .meta{min-width:42%}
.inv .meta div{display:flex;justify-content:space-between;gap:12px}
.inv .meta b{font-weight:600}
.inv .parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0}
.inv .box{border:1px solid #bbb;padding:8px 10px}
.inv .box h2{margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#555;font-weight:600}
.inv table{width:100%;border-collapse:collapse;margin-top:4px}
.inv th,.inv td{border:1px solid #bbb;padding:5px 6px;vertical-align:top}
.inv th{background:#f1f1f1;font-size:11px;text-align:left;font-weight:600}
.inv .r{text-align:right;font-variant-numeric:tabular-nums}
.inv .totals{display:flex;justify-content:space-between;gap:16px;margin-top:10px;align-items:flex-start}
.inv .words{flex:1;border:1px solid #bbb;padding:8px 10px}
.inv .sum{width:46%}
.inv .sum div{display:flex;justify-content:space-between;padding:3px 6px;border-bottom:1px solid #ddd}
.inv .sum .grand{font-weight:700;font-size:14px;border-bottom:2px solid #1a1a1a;border-top:2px solid #1a1a1a;margin-top:2px}
.inv .foot{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px}
.inv .sign{margin-top:36px;text-align:right}
.inv .sign .line{display:inline-block;min-width:60mm;border-top:1px solid #1a1a1a;padding-top:4px}
.inv .mark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:110px;font-weight:800;letter-spacing:.1em;color:rgba(160,0,0,.12);transform:rotate(-28deg)}
.inv .small{font-size:11px}
@page{size:A4;margin:0}
@media print{body{margin:0}.inv{box-shadow:none}}
`;
