#!/usr/bin/env node
/**
 * rules-of-hooks 静态检查（构建期门禁）
 *
 * 为什么需要它：
 *   React 的 Hook 调用顺序必须在每次渲染中完全一致，否则运行时会抛
 *     · #300 Rendered fewer hooks than expected（提前 return 之后还有 Hook）
 *     · #310 Rendered more hooks than during the previous render（条件分支里新调用 Hook）
 *   两者都会让整棵 React 树被卸载 → 白屏 / 兜底页，在 iOS 主屏 PWA 上表现为「必须杀后台重开」。
 *   2026-10-31 就因此崩过：TodoBoardView 在 `if (tabs.length === 0) return <EmptyState/>`
 *   之后还声明了 12 个 Hook，勾掉最后一条任务（分组变空）即白屏。
 *
 * 检查规则（只覆盖 React 明确禁止的写法，尽量零误报）：
 *   1. Hook 出现在函数体内某个 `return` 语句之后；
 *   2. Hook 出现在 if / for / while / do / switch / try 块内；
 *   3. Hook 出现在三元表达式或 `&&` / `||` / `??` 的右侧。
 *   不进入嵌套函数体（回调里的 Hook 由回调自身检查）；单行表达式箭头函数也会检查。
 *
 * 逃生口：确实需要例外时，在该行末尾加注释 `hook-check-ignore`。
 */
const fs = require('fs');
const path = require('path');

let ts;
try {
  ts = require('typescript');
} catch {
  console.error('[check-hooks] 找不到 typescript，跳过检查');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..', 'src');
const HOOK_RE = /^use[A-Z0-9_]/;
const IGNORE_RE = /hook-check-ignore/;
const CONTROL = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CatchClause,
]);
const SHORT_CIRCUIT = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function listFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) listFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const problems = [];

function checkFile(file, text) {
  const sf = ts.createSourceFile(
    file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;

  const isFn = (n) =>
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) || ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n);

  function checkBody(owner, body) {
    let sawReturn = false;
    const statements = ts.isBlock(body) ? body.statements : [body];

    for (const stmt of statements) {
      // 判断「该语句内部是否含 return」（不进嵌套函数）
      let hasReturn = false;
      const scanReturn = (n) => {
        if (isFn(n) && n !== owner) return;
        if (ts.isReturnStatement(n)) hasReturn = true;
        ts.forEachChild(n, scanReturn);
      };
      scanReturn(stmt);

      const scanHooks = (n, insideControl) => {
        if (isFn(n) && n !== owner) return;
        let next = insideControl;
        if (CONTROL.has(n.kind)) next = true;
        if (ts.isBinaryExpression(n) && SHORT_CIRCUIT.has(n.operatorToken.kind)) next = true;

        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && HOOK_RE.test(n.expression.text)) {
          const line = lineOf(n);
          const srcLine = sf.text.split('\n')[line] || '';
          if (!IGNORE_RE.test(srcLine)) {
            let kind = null;
            if (insideControl) kind = '写在条件/循环/短路表达式里';
            else if (sawReturn) kind = '写在了提前 return 之后';
            if (kind) problems.push({ file, line: line + 1, kind, hook: n.expression.text });
          }
        }
        ts.forEachChild(n, (c) => scanHooks(c, next));
      };
      scanHooks(stmt, false);

      if (hasReturn) sawReturn = true;
    }
  }

  const visit = (n) => {
    if (isFn(n) && n.body) checkBody(n, n.body);
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

for (const file of listFiles(ROOT)) {
  checkFile(file, fs.readFileSync(file, 'utf8'));
}

if (problems.length === 0) {
  console.log('[check-hooks] OK：未发现违反 rules-of-hooks 的调用');
  process.exit(0);
}

console.error('\n[check-hooks] 发现会让 React 崩溃（#300 / #310 白屏）的 Hook 用法：\n');
for (const p of problems) {
  console.error(`  ${path.relative(process.cwd(), p.file)}:${p.line}  ${p.hook}()  —— ${p.kind}`);
}
console.error('\n修法：把 Hook 全部移到函数体最顶部、任何 return / 分支之前；确实需要例外时在该行加注释 hook-check-ignore。\n');
process.exit(1);
