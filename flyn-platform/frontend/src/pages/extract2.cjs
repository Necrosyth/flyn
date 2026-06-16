const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'DashboardModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const panelRegex = /const Accounting(CreditNote|RecordPayment|Audit)Panel\s*=\s*\([^=]*=>\s*\{/g;

let match;
const panelsToExtract = [];

while ((match = panelRegex.exec(content)) !== null) {
  const startIndex = match.index;
  // find the matching closing brace
  let braceCount = 0;
  let endIndex = -1;
  let inString = false;
  let stringChar = '';
  
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    const prevChar = content[i-1];
    
    if ((char === "'" || char === '"' || char === "`") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }
    
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }
  
  if (endIndex !== -1) {
    let blockStart = startIndex;
    const preMatchStr = content.substring(0, startIndex);
    const lastComment = preMatchStr.lastIndexOf('// ─── Accounting:');
    if (lastComment !== -1 && startIndex - lastComment < 200) {
      blockStart = lastComment;
    }
    panelsToExtract.push({
      name: `Accounting${match[1]}Panel`,
      start: blockStart,
      end: endIndex + 1,
      content: content.substring(blockStart, endIndex + 1)
    });
  }
}

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
  content = content.substring(0, insertIndex) + extractedContent + content.substring(insertIndex);
  fs.writeFileSync(filePath, content);
  console.log(`Successfully extracted ${panelsToExtract.length} panels.`);
} else {
  console.log("Could not find insert target.");
}
