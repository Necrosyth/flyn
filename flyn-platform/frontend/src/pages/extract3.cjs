const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'DashboardModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find all panels starting with const Accounting...Panel = 
const searchStr = 'const Accounting';
let idx = 0;
const panelsToExtract = [];

// Avoid extracting if we're not inside DashboardModule
const dashStart = content.indexOf('const DashboardModule = () => {');

while (true) {
  idx = content.indexOf(searchStr, idx);
  if (idx === -1) break;
  
  if (idx <= dashStart) {
    idx += searchStr.length;
    continue; // already extracted or something else
  }
  
  // Find "Panel"
  const panelIdx = content.indexOf('Panel', idx);
  if (panelIdx === -1 || panelIdx > idx + 50) {
    idx += searchStr.length;
    continue;
  }
  
  const name = content.substring(idx + 6, panelIdx + 5);
  
  // Now find the start of the function body `=> {` or just find the matching braces
  // A robust way: find the first `{` after `=>`
  let arrowIdx = content.indexOf('=>', panelIdx);
  if (arrowIdx === -1) {
    idx += searchStr.length;
    continue;
  }
  
  let bodyStartIdx = content.indexOf('{', arrowIdx);
  if (bodyStartIdx === -1) {
    idx += searchStr.length;
    continue;
  }
  
  // now do brace counting starting from bodyStartIdx
  let braceCount = 0;
  let endIndex = -1;
  let inString = false;
  let stringChar = '';
  
  for (let i = bodyStartIdx; i < content.length; i++) {
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
    let blockStart = idx;
    const preMatchStr = content.substring(0, idx);
    const lastComment = preMatchStr.lastIndexOf('// ─── Accounting:');
    if (lastComment !== -1 && idx - lastComment < 200) {
      blockStart = lastComment;
    }
    
    panelsToExtract.push({
      name,
      start: blockStart,
      end: endIndex + 1,
      content: content.substring(blockStart, endIndex + 1)
    });
    
    idx = endIndex + 1;
  } else {
    idx += searchStr.length;
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
