// Bitta HTML faylga yig'ish: CSS va JS ichiga joylanadi.
//   node tools/build.mjs            -> dist/lola-bog.html (istalgan hostingga yuklash mumkin)
//   node tools/build.mjs --embed    -> dist/lola-bog.embed.html (<html>/<head>/<body> tegsiz bo'lak)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const embed = process.argv.includes('--embed');
let html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
const js = readFileSync(join(root, 'js/app.js'), 'utf8');

if (js.includes('</script')) throw new Error('app.js ichida </script bor: inline qilib bo\'lmaydi');

html = html
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script type="module">\n${js}\n</script>`);

if (embed) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<body[^>]*>\s*/i, '<script>document.body.dataset.mode = "overview";</script>\n')
    .replace(/<\/body>\s*/i, '');
}

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', embed ? 'lola-bog.embed.html' : 'lola-bog.html');
writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB)`);
