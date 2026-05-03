const fs = require('fs');
const lines = fs.readFileSync('src/pages/recordings/detail.tsx', 'utf8').split('\n');
console.log(lines.slice(-30).join('\n'));
