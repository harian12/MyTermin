export function parseMarkdown(md: string): string {
  if (!md) return ''

  // 1. Extract and protect code blocks
  const codeBlocks: string[] = []
  let text = md.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_match, lang, code) => {
    const escapedCode = escapeHtml(code.trimEnd())
    const langBadge = lang ? `<span class="absolute top-2 right-2 text-[10px] font-mono text-muted-foreground uppercase opacity-70">${escapeHtml(lang)}</span>` : ''
    const block = `<div class="relative my-3 rounded-lg bg-[#14151f] border border-border/80 p-3 overflow-x-auto text-xs font-mono">${langBadge}<pre><code>${escapedCode}</code></pre></div>`
    const placeholder = `%%CODEBLOCK_${codeBlocks.length}%%`
    codeBlocks.push(block)
    return placeholder
  })

  // 2. Escape HTML in regular text
  text = escapeHtml(text)

  // 3. Inline code
  text = text.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted/60 font-mono text-xs text-primary">$1</code>')

  // 4. Headers
  text = text.replace(/^######\s+(.*$)/gim, '<h6 class="text-xs font-bold text-foreground mt-4 mb-1">$1</h6>')
  text = text.replace(/^#####\s+(.*$)/gim, '<h5 class="text-sm font-bold text-foreground mt-4 mb-1">$1</h5>')
  text = text.replace(/^####\s+(.*$)/gim, '<h4 class="text-base font-bold text-foreground mt-5 mb-1.5">$1</h4>')
  text = text.replace(/^###\s+(.*$)/gim, '<h3 class="text-lg font-bold text-foreground mt-5 mb-2 border-b border-border/40 pb-1">$1</h3>')
  text = text.replace(/^##\s+(.*$)/gim, '<h2 class="text-xl font-bold text-foreground mt-6 mb-2 border-b border-border/60 pb-1.5">$1</h2>')
  text = text.replace(/^#\s+(.*$)/gim, '<h1 class="text-2xl font-black text-foreground mt-6 mb-3 border-b border-border pb-2">$1</h1>')

  // 5. Horizontal Rules
  text = text.replace(/^(?:---|\*\*\*|___)\s*$/gim, '<hr class="my-5 border-border/60" />')

  // 6. Blockquotes
  text = text.replace(/^\>\s+(.*$)/gim, '<blockquote class="border-l-4 border-primary/60 pl-3 my-2 text-muted-foreground italic text-xs">$1</blockquote>')

  // 7. Bold, Italic, Strikethrough
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')
  text = text.replace(/__(.*?)__/g, '<strong class="font-bold text-foreground">$1</strong>')
  text = text.replace(/\*(.*?)\*/g, '<em class="italic text-foreground/90">$1</em>')
  text = text.replace(/_(.*?)_/g, '<em class="italic text-foreground/90">$1</em>')
  text = text.replace(/~~(.*?)~~/g, '<del class="line-through text-muted-foreground">$1</del>')

  // 8. Task Lists & Unordered Lists
  text = text.replace(/^\s*-\s+\[ \]\s+(.*$)/gim, '<li class="flex items-center gap-2 list-none my-0.5"><input type="checkbox" disabled class="rounded" /> <span>$1</span></li>')
  text = text.replace(/^\s*-\s+\[x\]\s+(.*$)/gim, '<li class="flex items-center gap-2 list-none my-0.5"><input type="checkbox" checked disabled class="rounded text-primary" /> <span class="line-through text-muted-foreground">$1</span></li>')
  text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc my-0.5">$1</li>')

  // 9. Links & Images
  text = text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-md border border-border/60 my-2" />')
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">$1</a>')

  // 10. Tables
  text = parseTables(text)

  // 11. Paragraphs
  const lines = text.split('\n')
  const processed: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith('<li')) {
      if (!inList) {
        processed.push('<ul class="my-2 space-y-0.5 text-xs text-foreground/90">')
        inList = true
      }
      processed.push(line)
    } else {
      if (inList) {
        processed.push('</ul>')
        inList = false
      }
      if (
        line.trim() &&
        !line.startsWith('<h') &&
        !line.startsWith('<blockquote') &&
        !line.startsWith('<hr') &&
        !line.startsWith('<div') &&
        !line.startsWith('<table') &&
        !line.startsWith('%%CODEBLOCK_')
      ) {
        processed.push(`<p class="my-1.5 text-xs leading-relaxed text-foreground/80">${line}</p>`)
      } else {
        processed.push(line)
      }
    }
  }
  if (inList) {
    processed.push('</ul>')
  }

  let html = processed.join('\n')

  // 12. Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`%%CODEBLOCK_${i}%%`, codeBlocks[i]!)
  }

  return html
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseTables(text: string): string {
  const tableRegex = /((?:\|.+?\|\r?\n)+)/g
  return text.replace(tableRegex, (match) => {
    const rows = match.trim().split('\n').map(r => r.trim()).filter(Boolean)
    if (rows.length < 2) return match

    const headerRow = rows[0]!
    const separatorRow = rows[1]!
    if (!separatorRow.includes('---')) return match

    const parseCells = (row: string) =>
      row.split('|').slice(1, -1).map(c => c.trim())

    const headers = parseCells(headerRow)
    const headerHtml = `<thead><tr class="border-b border-border bg-muted/30">${headers.map(h => `<th class="px-3 py-1.5 text-left text-xs font-semibold text-foreground">${h}</th>`).join('')}</tr></thead>`

    const bodyRows = rows.slice(2)
    const bodyHtml = `<tbody>${bodyRows.map(r => `<tr class="border-b border-border/30 hover:bg-muted/10">${parseCells(r).map(c => `<td class="px-3 py-1.5 text-xs text-foreground/80">${c}</td>`).join('')}</tr>`).join('')}</tbody>`

    return `<div class="my-3 overflow-x-auto rounded-lg border border-border/60"><table class="w-full border-collapse font-sans">${headerHtml}${bodyHtml}</table></div>`
  })
}
