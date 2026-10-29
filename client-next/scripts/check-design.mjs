// Guards the app's design language (see DESIGN.md). Run: npm run check:design
// Fails (exit 1) when a component steps outside the shared tokens, so the look cannot drift page by page.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'src');
const SKIP_DIRS = [`${sep}components${sep}ui`]; // shadcn primitives keep their own defaults

const RULES = [
  { name: 'font size off the scale (12/13/14/15/16/18/22/26/28)', re: /text-\[(?!(12|13|14|15|16|18|22|26|28)px\])[0-9.]+px\]/g },
  { name: 'font weight off the scale (use medium or semibold)', re: /(?<![\w-])font-(bold|black|extrabold|thin|light)(?![\w-])/g },
  { name: 'radius off the scale (use rounded-md, rounded-lg or rounded-full)', re: /(?<![\w-])rounded(-(xl|2xl|3xl|sm|xs|none))?(?![\w-])/g, only: /rounded(?![-\w])|rounded-(xl|2xl|3xl)/ },
  { name: 'hard-coded colour (use a token from globals.css)', re: /#[0-9a-fA-F]{6}\b|rgba?\(\s*\d/g, skipFile: /reporting[\\/]page\.tsx$/ },
  { name: 'raw palette class (use a semantic token)', re: /(?<![\w-])(?:text|bg|border|ring|from|to|via|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}/g },
  { name: 'component sets its own font family (change it in layout.tsx)', re: /font-mono|font-serif|fontFamily/g },
  { name: 'raw Dialog (use ModuleModal or ConfirmDialog)', re: /<DialogContent/g, skipFile: /module-modal\.tsx$/ },
  { name: 'uppercase / tracked label (labels are sentence case)', re: /(?<![\w-])uppercase(?![\w-])|tracking-(wide|wider|widest)/g, skipFile: /login[\\/]page\.tsx$/ },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (SKIP_DIRS.some((s) => p.endsWith(s))) continue;
      yield* walk(p);
    } else if (p.endsWith('.tsx')) yield p;
  }
}

let problems = 0;
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const rule of RULES) {
    if (rule.skipFile && rule.skipFile.test(file)) continue;
    for (const m of text.matchAll(rule.re)) {
      if (rule.only && !rule.only.test(m[0])) continue;
      const line = text.slice(0, m.index).split('\n').length;
      console.log(`${relative(process.cwd(), file)}:${line}  ${rule.name}  → ${m[0]}`);
      problems++;
    }
  }
  // A dialog with required fields must keep its save button disabled until they are filled (canSave)
  if (/<ModuleModal/.test(text) && /\brequired\b/.test(text) && /onSave=/.test(text) && !/canSave=/.test(text)) {
    console.log(`${relative(process.cwd(), file)}  dialog has required fields but no canSave on its save button`);
    problems++;
  }
}
console.log(problems === 0 ? 'Design check passed.' : `\n${problems} design problem(s).`);
process.exit(problems === 0 ? 0 : 1);
