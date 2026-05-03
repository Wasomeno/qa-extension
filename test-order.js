const fs = require('fs');
let content = fs.readFileSync('src/pages/recordings/detail.tsx', 'utf8');

// 1. Extract Description
const descRegex = /\{\/\* Description \*\/\}[\s\S]*?(?=\{\/\* Source Type Indicator \*\/)/;
const descMatch = content.match(descRegex);

// 2. Extract Source Type
const sourceRegex = /\{\/\* Source Type Indicator \*\/\}[\s\S]*?(?=\{\/\* Video Player Section \*\/)/;
const sourceMatch = content.match(sourceRegex);

// 3. Extract Video Section
const videoRegex = /\{\/\* Video Player Section \*\/\}[\s\S]*?(?=\{\/\* Metadata \*\/)/;
const videoMatch = content.match(videoRegex);

if (descMatch && sourceMatch && videoMatch) {
  // Remove them from the original content
  content = content.replace(descMatch[0], '');
  content = content.replace(sourceMatch[0], '');
  content = content.replace(videoMatch[0], '');

  // Now, the insertion point is right after `<div className="max-w-4xl mx-auto w-full space-y-6">`
  const insertionPoint = `<div className="max-w-4xl mx-auto w-full space-y-6">`;
  
  const newOrder = `
          ${videoMatch[0]}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-4 flex-1">
              ${descMatch[0]}
              ${sourceMatch[0]}
            </div>
          </div>
`;

  content = content.replace(insertionPoint, insertionPoint + newOrder);
  
  // also change max-w-4xl to max-w-5xl
  content = content.replace('max-w-4xl', 'max-w-6xl');
  
  fs.writeFileSync('src/pages/recordings/detail.tsx', content);
  console.log('Reordered successfully.');
} else {
  console.log('Regex match failed.');
  if (!descMatch) console.log('Desc missing');
  if (!sourceMatch) console.log('Source missing');
  if (!videoMatch) console.log('Video missing');
}
