// One-shot codemod: wrap every Netlify function handler in __wrapErr() and add
// the require at the top. Brace-aware (handles helper functions after the
// handler, template literals, strings, comments).

const fs = require('fs');
const path = require('path');

const FN_DIR = path.join(__dirname, '..', 'netlify', 'functions');
const files = fs.readdirSync(FN_DIR).filter(f => f.endsWith('.js') && !f.startsWith('_'));

function findHandlerStart(src) {
    // Matches: exports.handler = async function (event) {
    //          exports.handler = async function NAMED(event) {
    //          exports.handler = async (event) => {
    const re = /exports\.handler\s*=\s*(async\s+function\s*[A-Za-z_]*\s*\([^)]*\)\s*|async\s*\([^)]*\)\s*=>\s*)\{/m;
    const m = src.match(re);
    if (!m) return null;
    return { fullMatchEnd: m.index + m[0].length, assignmentEnd: src.indexOf('=', m.index) + 1 };
}

function matchClosingBrace(src, openBraceIdx) {
    let depth = 1;
    let i = openBraceIdx + 1;
    let inStr = false, strCh = '', esc = false;
    let inLineComment = false, inBlockComment = false;
    let inTemplate = false;
    const templateInterpStack = []; // tracks brace depth at each template interp start

    while (i < src.length && depth > 0) {
        const c = src[i];
        const next = src[i + 1];

        if (inLineComment) {
            if (c === '\n') inLineComment = false;
            i++; continue;
        }
        if (inBlockComment) {
            if (c === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
            i++; continue;
        }
        if (inStr) {
            if (esc) { esc = false; }
            else if (c === '\\') { esc = true; }
            else if (c === strCh) { inStr = false; }
            i++; continue;
        }
        if (inTemplate) {
            if (esc) { esc = false; }
            else if (c === '\\') { esc = true; }
            else if (c === '`') { inTemplate = false; }
            else if (c === '$' && next === '{') {
                templateInterpStack.push(depth);
                depth++;
                i += 2; continue;
            } else if (c === '}' && templateInterpStack.length && depth - 1 === templateInterpStack[templateInterpStack.length - 1]) {
                templateInterpStack.pop();
                depth--;
            }
            i++; continue;
        }

        if (c === '/' && next === '/') { inLineComment = true; i += 2; continue; }
        if (c === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
        if (c === '\'' || c === '"') { inStr = true; strCh = c; i++; continue; }
        if (c === '`') { inTemplate = true; i++; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
    }

    if (depth !== 0) return -1;
    return i - 1; // index of the closing brace
}

let ok = 0, fail = 0;

for (const f of files) {
    const full = path.join(FN_DIR, f);
    let s = fs.readFileSync(full, 'utf8');

    if (s.includes('__wrapErr(')) {
        console.log(`  SKIP (already wrapped): ${f}`);
        continue;
    }

    // 1. Inject require at top, idempotent
    if (!s.includes("require('./_error_reporter')")) {
        s = "require('./_error_reporter');\nconst { wrap: __wrapErr } = require('./_error_reporter');\n" + s;
    } else if (!s.includes("__wrapErr")) {
        // require present but no wrap import — add wrap line just after
        s = s.replace(
            /require\('\.\/_error_reporter'\);/,
            "require('./_error_reporter');\nconst { wrap: __wrapErr } = require('./_error_reporter');"
        );
    }

    // 2. Locate handler
    const found = findHandlerStart(s);
    if (!found) {
        console.log(`  FAIL no handler match: ${f}`);
        fail++; continue;
    }

    const openBraceIdx = found.fullMatchEnd - 1; // points at '{'
    const closeBraceIdx = matchClosingBrace(s, openBraceIdx);
    if (closeBraceIdx < 0) {
        console.log(`  FAIL brace match: ${f}`);
        fail++; continue;
    }

    // 3. Insert ' __wrapErr(' after '='
    // 4. Insert ')' after the closing '}'
    const result =
        s.slice(0, found.assignmentEnd) +
        ' __wrapErr(' +
        s.slice(found.assignmentEnd, closeBraceIdx + 1) +
        ')' +
        s.slice(closeBraceIdx + 1);

    // Tidy up double-space if the original was 'exports.handler = ' (had a space after =)
    const tidied = result.replace(/exports\.handler\s*=\s+__wrapErr\(/, 'exports.handler = __wrapErr(');

    fs.writeFileSync(full, tidied);
    console.log(`  WRAP: ${f}`);
    ok++;
}

console.log(`\nWrapped ${ok}; failed ${fail}.`);
