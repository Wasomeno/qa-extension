const fs = require('fs');
let content = fs.readFileSync('./src/pages/recordings/detail.tsx', 'utf8');

// Replace the top wrapper and header
const oldHeader = `<div className="flex flex-col h-full bg-white">
      <header className="px-4 py-3 border-b flex items-center gap-3 bg-white sticky top-0 z-10">`;
const newHeader = `<div className="flex flex-col h-full bg-white overflow-hidden">
      <header className="px-4 py-3 border-b flex items-center gap-3 bg-white shrink-0 z-10">`;

content = content.replace(oldHeader, newHeader);

// Replace ScrollArea with the new split layout
const oldScrollAreaStart = `<ScrollArea className="flex-1">
        <div className="p-4 space-y-6">`;

const newScrollAreaStart = `<div className="flex flex-1 overflow-hidden bg-zinc-50">
        {/* Left Pane: Video and Meta */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 relative">
          <div className="max-w-4xl mx-auto w-full space-y-6">`;

content = content.replace(oldScrollAreaStart, newScrollAreaStart);

// Now we need to split before the Tabs
const oldSeparatorTabs = `<Separator />

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 pb-0 overflow-x-auto">`;

const newSeparatorTabs = `</div>
        </div>

        {/* Right Pane: Sidebar with Tabs */}
        <div className="w-[450px] border-l bg-white flex flex-col shrink-0 z-10 shadow-[-4px_0_24px_-16px_rgba(0,0,0,0.05)]">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 px-2 pt-2 pb-0 overflow-x-auto shrink-0 bg-gray-50/80">`;

content = content.replace(oldSeparatorTabs, newSeparatorTabs);

// We need to wrap the tab content in a ScrollArea
const oldTabContentStart = `{/* Tab Content */}
          {activeTab === 'steps' && (`;

const newTabContentStart = `<ScrollArea className="flex-1">
            <div className="p-4">
          {/* Tab Content */}
          {activeTab === 'steps' && (`;

content = content.replace(oldTabContentStart, newTabContentStart);

// Finally, close the new ScrollArea and panes at the end of the component
// The end of the component currently is:
/*
        </div>
      </ScrollArea>
    </div>
  );
};
*/
const oldEnd = `        </div>
      </ScrollArea>
    </div>
  );
};`;

const newEnd = `            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};`;

content = content.replace(oldEnd, newEnd);

// One detail: Jam places the video at the top, which our layout now inherently supports since the left pane is a flex column.
// Let's reorder the video to be at the top of the left pane instead of below the description.
// It's a bit tricky with string replacement, but let's see.
fs.writeFileSync('./src/pages/recordings/detail.tsx', content);
console.log('Refactoring complete.');
