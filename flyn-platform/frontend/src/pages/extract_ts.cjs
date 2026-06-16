const fs = require('fs');
const ts = require('typescript');
const path = require('path');

const filePath = path.join(__dirname, 'DashboardModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const sourceFile = ts.createSourceFile(
  'DashboardModule.tsx',
  content,
  ts.ScriptTarget.Latest,
  true
);

let dashboardDecl = null;
ts.forEachChild(sourceFile, node => {
  if (ts.isVariableStatement(node)) {
    const decl = node.declarationList.declarations[0];
    if (decl && decl.name.getText() === 'DashboardModule') {
      dashboardDecl = decl.initializer;
    }
  }
});

if (!dashboardDecl || !ts.isArrowFunction(dashboardDecl)) {
  console.error("DashboardModule not found or not an arrow function");
  process.exit(1);
}

const body = dashboardDecl.body;
if (!ts.isBlock(body)) {
  console.error("DashboardModule body is not a block");
  process.exit(1);
}

const panelsToExtract = [];

for (const stmt of body.statements) {
  if (ts.isVariableStatement(stmt)) {
    const decl = stmt.declarationList.declarations[0];
    if (decl && decl.name && decl.name.getText && decl.name.getText().startsWith('Accounting') && decl.name.getText().endsWith('Panel')) {
      if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
        
        let start = stmt.getStart(sourceFile, false); // true to include comments? getStart() with no args skips trivia
        // getFullStart() gets it with trivia (comments)
        let fullStart = stmt.getFullStart();
        let end = stmt.getEnd();
        
        const fullText = sourceFile.text;
        
        // Custom comment matching just to be safe
        let blockStart = start;
        const textBefore = fullText.substring(fullStart, start);
        const commentIdx = textBefore.lastIndexOf('// ─── Accounting:');
        if (commentIdx !== -1) {
          blockStart = fullStart + commentIdx;
        }

        panelsToExtract.push({
          name: decl.name.getText(),
          start: blockStart,
          end: end,
          content: fullText.substring(blockStart, end)
        });
      }
    }
  }
}

console.log(`Found ${panelsToExtract.length} panels.`);

// We must iterate backwards to safely modify the string
panelsToExtract.sort((a, b) => b.start - a.start);

let extractedContent = '';
for (const p of panelsToExtract) {
  console.log(`Extracting ${p.name}...`);
  extractedContent = p.content + '\n\n' + extractedContent;
  content = content.substring(0, p.start) + content.substring(p.end);
}

const insertTarget = 'const DashboardModule = () => {';
const insertIndex = content.indexOf(insertTarget);

if (insertIndex !== -1) {
  content = content.substring(0, insertIndex) + extractedContent + '\n\n' + content.substring(insertIndex);
  fs.writeFileSync(filePath, content);
  console.log(`Successfully extracted ${panelsToExtract.length} panels.`);
} else {
  console.log("Could not find insert target.");
}
